import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import type { Thread } from '@clawchat/shared';
import type { RootStackParamList } from '../App';

const SERVER_URL =
  (Constants.expoConfig?.extra as { SERVER_URL?: string } | undefined)?.SERVER_URL ??
  process.env.EXPO_PUBLIC_SERVER_URL ??
  'http://localhost:3001';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'ThreadList'>;

export default function ThreadListScreen() {
  const navigation = useNavigation<Navigation>();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadThreads = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${SERVER_URL}/threads`);
      const data = await response.json();
      setThreads(data);
    } catch (error) {
      console.error('Failed to load threads', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  return (
    <View style={styles.container}>
      <FlatList
        data={threads}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadThreads} />}
        ListEmptyComponent={<Text style={styles.empty}>No threads yet.</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('ThreadDetail', { threadId: item.id, title: item.title })}
            style={styles.threadCard}
          >
            <Text style={styles.threadTitle}>{item.title}</Text>
            <Text style={styles.threadMeta}>{new Date(item.updatedAt).toLocaleString()}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  threadCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    marginBottom: 12,
  },
  threadTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  threadMeta: {
    color: '#666',
    fontSize: 12,
  },
  empty: {
    textAlign: 'center',
    color: '#666',
    marginTop: 48,
  },
});
