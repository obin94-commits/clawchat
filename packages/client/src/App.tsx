import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ThreadListScreen from './screens/ThreadListScreen';
import ThreadDetailScreen from './screens/ThreadDetailScreen';

export type RootStackParamList = {
  ThreadList: undefined;
  ThreadDetail: {
    threadId: string;
    title: string;
    parentThreadId?: string;
    branchedFromMessageId?: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="ThreadList" component={ThreadListScreen} options={{ title: 'Threads' }} />
        <Stack.Screen
          name="ThreadDetail"
          component={ThreadDetailScreen}
          options={({ route }) => ({ title: route.params.title })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
