import * as Location from 'expo-location';
import type { LocationProvider } from '../hooks/useCurrentLocation';

export class ExpoLocationProvider implements LocationProvider {
  async requestPermission(): Promise<boolean> {
    return (await Location.requestForegroundPermissionsAsync()).status === 'granted';
  }
  async current() {
    const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: coords.latitude, lng: coords.longitude, accuracyM: coords.accuracy ?? undefined };
  }
  async lastKnown() {
    const location = await Location.getLastKnownPositionAsync();
    return location ? { lat: location.coords.latitude, lng: location.coords.longitude } : undefined;
  }
}
