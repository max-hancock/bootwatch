import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import MapScreen from '../screens/MapScreen';
import TimerScreen from '../screens/TimerScreen';
import FeedScreen from '../screens/FeedScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ReportPrompt from '../components/ReportPrompt';
import BrandHeaderTitle from '../components/BrandHeaderTitle';
import { useTheme } from '../context/ThemeContext';
import { fonts } from '../theme/fonts';

type TabIcon = React.ComponentProps<typeof Ionicons>['name'];

const TAB_CONFIG: Record<string, { icon: TabIcon; iconFocused: TabIcon }> = {
  Map: { icon: 'map-outline', iconFocused: 'map' },
  Timer: { icon: 'timer-outline', iconFocused: 'timer' },
  Feed: { icon: 'alert-circle-outline', iconFocused: 'alert-circle' },
  Ranks: { icon: 'trophy-outline', iconFocused: 'trophy' },
  Profile: { icon: 'person-outline', iconFocused: 'person' },
};

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const { colors } = useTheme();

  return (
    <>
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const config = TAB_CONFIG[route.name];
          const iconName = focused ? config.iconFocused : config.icon;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelStyle: {
          fontFamily: fonts.bodyMedium,
          fontSize: 11,
          letterSpacing: 0.2,
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: Platform.OS === 'android' ? 12 : 0,
        },
        headerStyle: {
          backgroundColor: colors.background,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        headerTitleStyle: {
          fontFamily: fonts.display,
          fontSize: 18,
          color: colors.text,
        },
        headerShadowVisible: false,
      })}
    >
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{ title: 'Map', headerTitleAlign: 'left', headerTitle: () => <BrandHeaderTitle section="Map" /> }}
      />
      <Tab.Screen name="Timer" component={TimerScreen} options={{ title: 'Timer' }} />
      {/* These screens carry the brand in the header; `title` still names the tab. */}
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{ title: 'Feed', headerTitleAlign: 'left', headerTitle: () => <BrandHeaderTitle section="Feed" /> }}
      />
      <Tab.Screen
        name="Ranks"
        component={LeaderboardScreen}
        options={{ title: 'Ranks', headerTitleAlign: 'left', headerTitle: () => <BrandHeaderTitle section="Ranks" /> }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
    <ReportPrompt />
    </>
  );
}
