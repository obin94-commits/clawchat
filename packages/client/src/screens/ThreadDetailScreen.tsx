import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import Constants from 'expo-constants';
import type { Message, WsServerEvent } from '@clawchat/shared';
import type { RootStackParamList } from '../App';

const SERVER_URL =
  (Constants.expoConfig?.extra as { SERVER_URL?: string } | undefined)?.SERVER_URL ??
  process.env.EXPO_PUBLIC_SERVER_URL ??
  'http://localhost:3001';

const WS_URL = SERVER_URL.replace(/^http/, 'ws');

type ThreadDetailRoute = RouteProp<RootStackParamList, 'ThreadDetail'>;

export default function ThreadDetailScreen() {
  const route = useRoute<ThreadDetailRoute>();
  const { threadId } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const socketRef = useRef<WebSocket | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const response = await fetch(`${SERVER_URL}/threads/${threadId}/messages`);
      const data = await response.json();
      setMessages(data);
    } catch (error) {
      console.error('Failed to load messages', error);
    }
  }, [threadId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'subscribe', threadId }));
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as WsServerEvent;
        if (payload.type === 'message.new') {
          setMessages((current) => [...current, payload.payload.message]);
        } else if (payload.type === 'message') {
          setMessages((current) => [...current, payload.message]);
        }
      } catch (error) {
        console.error('Failed to parse websocket message', error);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error', error);
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [threadId]);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content) return;

    try {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'send_message', threadId, content }));
      } else {
        const response = await fetch(`${SERVER_URL}/threads/${threadId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        const message = await response.json();
        setMessages((current) => [...current, message]);
      }
      setInput('');
    } catch (error) {
      console.error('Failed to send message', error);
    }
  }, [input, threadId]);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', default: undefined })}
    >
      <FlatList
        style={styles.list}
        data={sortedMessages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isGhost = item.displayType !== 'VISIBLE' || item.role === 'SYSTEM' || item.role === 'TOOL';
          return (
            <View style={[styles.messageBubble, isGhost && styles.ghostBubble]}>
              <Text style={[styles.messageRole, isGhost && styles.ghostText]}>{item.role}</Text>
              <Text style={[styles.messageText, isGhost && styles.ghostText]}>{item.content}</Text>
            </View>
          );
        }}
      />

      <View style={styles.composer}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Send a message"
          style={styles.input}
        />
        <Pressable onPress={sendMessage} style={styles.sendButton}>
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f2f2f2',
  },
  ghostBubble: {
    opacity: 0.5,
  },
  messageRole: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  messageText: {
    fontSize: 16,
    color: '#111',
  },
  ghostText: {
    fontSize: 12,
  },
  composer: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
