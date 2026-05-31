import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/constants/theme';

type Icon = React.ComponentProps<typeof Ionicons>['name'];

function icon(focused: boolean, on: Icon, off: Icon) {
  return <Ionicons name={focused ? on : off} size={24} color={focused ? colors.accent : colors.textMuted} />;
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle:           { backgroundColor: colors.bg },
      headerTintColor:       colors.accent,
      headerTitleStyle:      { fontWeight: '700', letterSpacing: 1 },
      tabBarStyle:           { backgroundColor: colors.tabBg, borderTopColor: colors.tabBorder },
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.textMuted,
    }}>
      <Tabs.Screen name="index"    options={{ title: 'Play',     tabBarIcon: ({ focused }) => icon(focused, 'game-controller', 'game-controller-outline') }} />
      <Tabs.Screen name="online"   options={{ title: 'Online',   tabBarIcon: ({ focused }) => icon(focused, 'globe', 'globe-outline') }} />
      <Tabs.Screen name="tutorial" options={{ title: 'Tutorial', tabBarIcon: ({ focused }) => icon(focused, 'school', 'school-outline') }} />
      <Tabs.Screen name="profile"  options={{ title: 'Profile',  tabBarIcon: ({ focused }) => icon(focused, 'person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}
