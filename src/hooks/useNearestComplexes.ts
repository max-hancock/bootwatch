import { useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { complexes } from '../data/complexes';
import { Complex } from '../types/complex';

export interface NearbyComplex {
  complex: Complex;
  meters: number;
}

// Five rather than three: complexes are packed tightly and visitor parking is often
// a walk from the building, so the right one is not always among the very closest.
const NEAREST_COUNT = 5;
/** Beyond this the user isn't parked at any of them, so suggesting one would just be noise. */
const MAX_METERS = 1200;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** "250 ft" up close, "0.4 mi" further out. */
export function formatDistance(meters: number): string {
  const feet = meters * 3.28084;
  if (feet < 528) return `${Math.max(10, Math.round(feet / 10) * 10)} ft`;
  return `${(feet / 5280).toFixed(1)} mi`;
}

/**
 * The complexes closest to the user, for picking where they just parked.
 * Asks for location permission if it hasn't been decided yet; with no
 * permission or no fix it returns an empty list and the caller shows the
 * normal list. Re-reads the position each time `enabled` turns on.
 */
export function useNearestComplexes(enabled: boolean): NearbyComplex[] {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted && permission.canAskAgain) {
          permission = await Location.requestForegroundPermissionsAsync();
        }
        if (!permission.granted || cancelled) return;
      } catch {
        return;
      }

      // Last known fix first so the suggestions appear instantly, then a fresh one.
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last && !cancelled) setCoords(last.coords);
      } catch {
        // Not available on every platform (e.g. web).
      }
      try {
        const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) setCoords(fresh.coords);
      } catch {
        // No fix — keep whatever we have.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return useMemo(() => {
    if (!coords) return [];
    return complexes
      .map((complex) => ({
        complex,
        meters: haversineMeters(coords.latitude, coords.longitude, complex.latitude, complex.longitude),
      }))
      .filter((n) => n.meters <= MAX_METERS)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, NEAREST_COUNT);
  }, [coords]);
}
