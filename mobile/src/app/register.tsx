import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { readCurrentLocation } from '@/features/auth/adapters/ExpoLocationProvider';
import { installMarker } from '@/features/auth/adapters/installMarker';
import { RegisterScreen } from '@/features/auth/screens/RegisterScreen';
import { storage } from '@/shared/runtime';
import { useSession } from '@/shared/session/SessionProvider';

export default function RegisterRoute() {
  const router = useRouter();
  const { register } = useSession();
  const getDeviceToken = useCallback(() => installMarker(storage), []);
  return (
    <RegisterScreen
      register={register}
      getDeviceToken={getDeviceToken}
      readLocation={readCurrentLocation}
      onSignIn={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
    />
  );
}
