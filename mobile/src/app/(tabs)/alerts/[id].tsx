import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertDetailScreen } from '@/features/alerts/screens/AlertDetailScreen';

export default function AlertDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return (
    <AlertDetailScreen
      alertId={id}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/alerts'))}
    />
  );
}
