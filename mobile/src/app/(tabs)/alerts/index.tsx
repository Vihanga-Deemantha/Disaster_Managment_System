import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { notificationPermissions } from '@/features/alerts/composition';
import { AlertsScreen } from '@/features/alerts/screens/AlertsScreen';

export default function AlertsRoute() {
  const router = useRouter();
  const open = useCallback(
    (id: string) => router.push({ pathname: '/alerts/[id]', params: { id } }),
    [router],
  );
  return <AlertsScreen permissions={notificationPermissions} onOpen={open} />;
}
