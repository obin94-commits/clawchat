import 'react-native-gesture-handler';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ThreadListScreen from './screens/ThreadListScreen';
import ThreadDetailScreen from './screens/ThreadDetailScreen';
import SettingsScreen from './screens/SettingsScreen';
import { ThemeProvider, useTheme } from './ThemeContext';
import { SettingsProvider } from './SettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';

export type RootStackParamList = {
  ThreadList: undefined;
  ThreadDetail: {
    threadId: string;
    title: string;
    parentThreadId?: string;
    branchedFromMessageId?: string;
  };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  const { theme } = useTheme();

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.bg,
      card: theme.surface,
      text: theme.text,
      border: theme.border,
      primary: theme.accent,
      notification: theme.accent,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.text,
          headerTitleStyle: { color: theme.text },
        }}
      >
        <Stack.Screen
          name="ThreadList"
          component={ThreadListScreen}
          options={({ navigation }) => ({
            title: 'ClawChat',
            headerRight: () => (
              <Pressable onPress={() => navigation.navigate('Settings')} style={{ marginRight: 4 }}>
                <Text style={{ color: theme.accent, fontSize: 15, fontWeight: '600' }}>Settings</Text>
              </Pressable>
            ),
          })}
        />
        <Stack.Screen
          name="ThreadDetail"
          component={ThreadDetailScreen}
          options={({ route }) => ({ title: route.params.title })}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ThemeProvider>
          <AppNavigator />
        </ThemeProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
