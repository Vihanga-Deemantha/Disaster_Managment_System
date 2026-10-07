import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="report" options={{ title: 'Report' }} />
      <Tabs.Screen name="my-reports" options={{ title: 'My reports' }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
    </Tabs>
  );
}
