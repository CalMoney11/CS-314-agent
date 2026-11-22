import { Tabs, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import React, { useEffect } from 'react';
import { Linking } from 'react-native';

// Defines the background refresh task; must run at startup, in global scope.
import { registerBackgroundRefresh } from '@/lib/background';

export default function TabLayout() {
  const router = useRouter();

  useEffect(() => {
    registerBackgroundRefresh().catch(() => {});

    // Tapping a notification opens the matching screen.
    const open = (data: Record<string, unknown> | undefined) => {
      if (data?.kind === 'email' && typeof data.account === 'string' && typeof data.id === 'string') {
        router.navigate({ pathname: '/email', params: { account: data.account, id: data.id } });
      } else if (data?.kind === 'canvas' && typeof data.url === 'string' && data.url.startsWith('https://')) {
        Linking.openURL(data.url);
      } else if (data?.kind === 'inbox') {
        router.navigate('/');
      }
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last.notification.request.content.data);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    return () => sub.remove();
  }, [router]);

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        // Hides the default bottom tab bar so the top-left menu controls navigation
        tabBarStyle: { display: 'none' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="explore" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="canvas" options={{ title: 'Canvas' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      <Tabs.Screen name="email" options={{ title: 'Email' }} />
    </Tabs>
  );
}
