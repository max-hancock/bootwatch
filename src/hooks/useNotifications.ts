import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // shouldShowAlert was split in SDK 53 into the banner and the notification
    // centre list, which are now both required.
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export function useNotifications() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    checkPermissions();

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {});

    return () => {
      notificationListener.current?.remove();
    };
  }, []);

  async function checkPermissions() {
    if (Platform.OS === 'web') {
      setPermissionStatus('denied');
      return;
    }
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionStatus(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
  }

  async function requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    if (!Device.isDevice) return false;

    const { status } = await Notifications.requestPermissionsAsync();
    const granted = status === 'granted';
    setPermissionStatus(granted ? 'granted' : 'denied');
    return granted;
  }

  async function scheduleNotification(title: string, body: string, triggerSeconds: number): Promise<string | null> {
    if (Platform.OS === 'web' || triggerSeconds <= 0) return null;

    return Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: { seconds: triggerSeconds, type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL },
    });
  }

  async function cancelAllScheduled() {
    if (Platform.OS === 'web') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  return { permissionStatus, requestPermissions, scheduleNotification, cancelAllScheduled };
}
