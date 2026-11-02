import { useCallback, useEffect, useRef, useState } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ParkingTimerProvider } from './src/context/ParkingTimerContext';
import { ToastProvider } from './src/context/ToastContext';
import { ReportCelebrationProvider } from './src/context/ReportCelebrationContext';
import { usePushToken } from './src/hooks/usePushToken';
import { markWhatsNewSeen } from './src/hooks/useWhatsNew';
import TabNavigator from './src/navigation/TabNavigator';
import AuthScreen from './src/screens/AuthScreen';
import PasswordRecoveryScreen from './src/screens/PasswordRecoveryScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import { TIMER_DEEP_LINK_PATH } from './src/lib/liveActivity';

const ONBOARDING_KEY = '@bootwatch_onboarded';

/** Tabs a notification is allowed to open via `data.screen`. */
const NOTIFICATION_SCREENS = ['Map', 'Timer', 'Feed', 'Ranks', 'Profile'];

const WEB_DOCUMENT_TITLE =
  Constants.expoConfig?.name ?? Constants.expoConfig?.slug ?? 'BootWatch';

function RootNavigator() {
  const { user, loading, needsPasswordRecovery } = useAuth();
  const { colors } = useTheme();
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  usePushToken();

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => setHasOnboarded(val === 'true'));
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    // Onboarding just covered the current features, so skip the "What's new" card.
    markWhatsNewSeen();
    setHasOnboarded(true);
  }, []);

  if (loading || hasOnboarded === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!hasOnboarded) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  if (user && needsPasswordRecovery) {
    return <PasswordRecoveryScreen />;
  }

  return user ? (
    <ParkingTimerProvider>
      <TabNavigator />
    </ParkingTimerProvider>
  ) : (
    <AuthScreen />
  );
}

export default function App() {
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let retry: ReturnType<typeof setTimeout> | null = null;

    // Open the tab the notification names (timer alerts → Timer, sighting and
    // reaction alerts → Feed). When the tap launched the app, the tabs are not
    // mounted yet (auth is still loading), so keep trying for a few seconds.
    const openScreen = (screen: string, attempt = 0) => {
      const nav = navigationRef.current;
      if (nav?.isReady() && nav.getRootState()?.routeNames?.includes(screen)) {
        nav.navigate(screen);
        return;
      }
      if (attempt < 20) retry = setTimeout(() => openScreen(screen, attempt + 1), 300);
    };

    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      const screen = response?.notification.request.content.data?.screen;
      if (typeof screen === 'string' && NOTIFICATION_SCREENS.includes(screen)) openScreen(screen);
    };

    // The tap that cold-started the app happens before the listener below exists.
    try {
      handleResponse(Notifications.getLastNotificationResponse());
      Notifications.clearLastNotificationResponse();
    } catch {
      // Older native module without these calls — taps while running still work.
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

    // Tapping the lock-screen timer opens bootwatch:///timer.
    const handleUrl = (url: string | null) => {
      if (!url) return;
      const { hostname, path } = Linking.parse(url);
      if (hostname === TIMER_DEEP_LINK_PATH || path === TIMER_DEEP_LINK_PATH) openScreen('Timer');
    };
    void Linking.getInitialURL().then(handleUrl);
    const linkSub = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => {
      subscription.remove();
      linkSub.remove();
      if (retry) clearTimeout(retry);
    };
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <ReportCelebrationProvider>
              <NavigationContainer
                ref={navigationRef}
                documentTitle={{
                  formatter: (options, route) =>
                    options?.title ?? route?.name ?? WEB_DOCUMENT_TITLE,
                }}
              >
                <RootNavigator />
                <ThemedStatusBar />
              </NavigationContainer>
              </ReportCelebrationProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}
