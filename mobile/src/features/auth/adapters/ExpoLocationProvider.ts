import * as Location from 'expo-location';

export type LocationReading =
  { status: 'ok'; lat: string; lng: string } | { status: 'denied' } | { status: 'unavailable' };

/**
 * "Use my current location" on the registration form: the one place the app uses expo-location. It
 * asks permission at the moment it is needed, and answers in plain terms the screen can word. The
 * coordinates are rounded to about a metre, as on the web.
 */
export async function readCurrentLocation(): Promise<LocationReading> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
    if (!(await Location.hasServicesEnabledAsync())) return { status: 'unavailable' };
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.LocationAccuracy.High,
    });
    return { status: 'ok', lat: coords.latitude.toFixed(5), lng: coords.longitude.toFixed(5) };
  } catch {
    return { status: 'unavailable' };
  }
}
