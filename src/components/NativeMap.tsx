import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Complex } from '../types/complex';
import { getVisitorLimitMarkerColor } from '../utils/visitorLimitColors';
import { LiveMarker } from '../utils/liveSightings';
import { REXBURG_CENTER } from '../data/complexes';

export interface MapFitTarget {
  points: { latitude: number; longitude: number }[];
  /** Changes on every request, so asking to fit the same points twice still moves the map. */
  key: number;
}

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

function PinMarker({ color }: { color: string }) {
  return (
    <View style={styles.pinWrap} accessibilityLabel="Complex marker">
      <View style={[styles.pinOuter, { borderColor: color }]}>
        <View style={[styles.pinInner, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

// Google Maps on Android (required; Android has no built-in map) and Apple Maps
// on iOS. iOS Google Maps support via react-native-maps is currently broken on
// RN 0.83 / New Architecture (missing react-native-google-maps podspec); Apple
// Maps gives a near-identical visual experience for marker-based displays.
export default function NativeMap({ complexes, onMarkerPress, colorOverrides, live, dimOthers, fitTarget }: Props) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!fitTarget || fitTarget.points.length === 0) return;
    if (fitTarget.points.length === 1) {
      const [p] = fitTarget.points;
      mapRef.current?.animateToRegion({ ...p, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 400);
      return;
    }
    mapRef.current?.fitToCoordinates(fitTarget.points, {
      edgePadding: { top: 220, right: 60, bottom: 160, left: 60 },
      animated: true,
    });
  }, [fitTarget]);

  return (
    <MapView
      ref={mapRef}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      style={styles.map}
      initialRegion={REXBURG_CENTER}
      showsUserLocation
    >
      {complexes.map((complex) => {
        const color =
          colorOverrides?.get(complex.id) ??
            getVisitorLimitMarkerColor(complex.visitorTimeLimitMinutes, complex.visitorLimitSignageKnown);
        const liveInfo = live?.get(complex.id);
        // tracksViewChanges is off for performance, so a marker only redraws when it remounts.
        // The dimmed state goes in the key to force that when focus on live reports turns on or off.
        const dimmed = !!dimOthers && !liveInfo;
        const stateKey = dimmed ? 'dim' : 'normal';
        return (
          <Marker
            key={`${complex.id}:${complex.latitude}:${complex.longitude}:${color}:${stateKey}`}
            coordinate={{ latitude: complex.latitude, longitude: complex.longitude }}
            title={complex.name}
            onPress={() => onMarkerPress(complex)}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={liveInfo ? 10 : 1}
            tracksViewChanges={false}
          >
            <View style={dimmed && styles.dimmed}>
              <PinMarker color={color} />
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  pinWrap: {
    alignItems: 'center',
  },
  pinOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 5,
  },
  pinInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dimmed: {
    opacity: 0.25,
  },
});
