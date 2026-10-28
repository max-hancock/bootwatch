import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { Complex } from '../types/complex';
import { getVisitorLimitMarkerColor } from '../utils/visitorLimitColors';
import { REXBURG_CENTER } from '../data/complexes';
import { LiveMarker } from '../utils/liveSightings';
import type { MapFitTarget } from './NativeMap';

/** Distinct from risk pins (green/yellow/red) so "you are here" is obvious. */
const USER_LOCATION_BLUE = '#2563EB';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

// Module-scoped loader so repeated mounts don't re-inject the script tag.
const loader = new Loader({
  apiKey: API_KEY,
  version: 'weekly',
});

interface Props {
  complexes: Complex[];
  onMarkerPress: (complex: Complex) => void;
  colorOverrides?: Map<string, string>;
  /** Complexes with a report in the last hour, keyed by complex id. */
  live?: Map<string, LiveMarker>;
  /** Fade every pin that isn't live, so the ones with a recent report stand out. */
  dimOthers?: boolean;
  fitTarget?: MapFitTarget | null;
}

function buildPinSvg(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <defs>
      <filter id="s" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.35"/>
      </filter>
    </defs>
    <path filter="url(#s)" fill="${color}" stroke="#ffffff" stroke-width="2.5"
      d="M18 2C10.8 2 5 7.48 5 14.2c0 8.1 11.2 20.5 12.4 21.8.4.4 1 .6 1.6.6s1.2-.2 1.6-.6C21.8 34.7 33 22.3 33 14.2 33 7.48 27.2 2 20 2h-2z"/>
    <circle fill="#ffffff" cx="18" cy="15" r="5.5" opacity="0.95"/>
    <circle fill="${color}" cx="18" cy="15" r="3"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function WebMap({ complexes, onMarkerPress, colorOverrides, live, dimOthers, fitTarget }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const userDotRef = useRef<google.maps.Marker | null>(null);
  const isMountedRef = useRef(true);
  // Triggers the marker-sync effect to re-run once the async map instance is ready.
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;

    if (!API_KEY) {
      console.warn('[WebMap] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set. Map will not render.');
      return;
    }

    loader
      .importLibrary('maps')
      .then((maps) => {
        if (!isMountedRef.current || !containerRef.current) return;

        const map = new maps.Map(containerRef.current, {
          center: { lat: REXBURG_CENTER.latitude, lng: REXBURG_CENTER.longitude },
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;
        setMapReady(true);

        // One-shot user location request; matches Leaflet behavior.
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!isMountedRef.current || !mapRef.current) return;
              userDotRef.current?.setMap(null);
              userDotRef.current = new google.maps.Marker({
                position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
                map: mapRef.current,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: USER_LOCATION_BLUE,
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 3,
                },
                clickable: false,
                zIndex: 9999,
              });
            },
            () => {
              /* permission denied or unavailable — silent, same as Leaflet */
            },
            { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
          );
        }
      })
      .catch((err) => {
        console.error('[WebMap] Failed to load Google Maps JS API:', err);
      });

    return () => {
      isMountedRef.current = false;
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      userDotRef.current?.setMap(null);
      userDotRef.current = null;
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    complexes.forEach((complex) => {
      const color =
        colorOverrides?.get(complex.id) ??
          getVisitorLimitMarkerColor(complex.visitorTimeLimitMinutes, complex.visitorLimitSignageKnown);
      const liveInfo = live?.get(complex.id);
      const marker = new google.maps.Marker({
        position: { lat: complex.latitude, lng: complex.longitude },
        map,
        title: complex.name,
        // Live pins sit on top so a recent report is never hidden under a neighbour.
        zIndex: liveInfo ? 1000 : undefined,
        opacity: dimOthers && !liveInfo ? 0.25 : 1,
        icon: {
          url: buildPinSvg(color),
          scaledSize: new google.maps.Size(36, 44),
          anchor: new google.maps.Point(18, 42),
        },
      });
      marker.addListener('click', () => onMarkerPress(complex));
      markersRef.current.push(marker);
    });
  }, [complexes, onMarkerPress, colorOverrides, live, dimOthers, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !fitTarget || fitTarget.points.length === 0) return;
    if (fitTarget.points.length === 1) {
      const [p] = fitTarget.points;
      map.panTo({ lat: p.latitude, lng: p.longitude });
      map.setZoom(17);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    fitTarget.points.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }));
    map.fitBounds(bounds, { top: 220, right: 60, bottom: 160, left: 60 });
  }, [fitTarget, mapReady]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, width: '100%', height: '100%', minHeight: 400 }}
    />
  );
}
