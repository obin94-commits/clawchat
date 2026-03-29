import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import type { MemoryChip, Message, WsServerEvent } from '@clawchat/shared';
import type { RootStackParamList } from '../App';
import MemoryChipComponent from '../components/MemoryChip';
import ThreadHeader from '../components/ThreadHeader';
import AgentStatusBar, { AgentStatus } from '../components/AgentStatusBar';

const SERVER_URL =
  (Constants.expoConfig?.extra as { SERVER_URL?: string } | undefined)?.SERVER_URL ??
  process.env.EXPO_PUBLIC_SERVER_URL ??
  'http://localhost:3001';

const WS_URL = SERVER_URL.replace(/^http/, 'ws');

type ThreadDetailRoute = RouteProp<RootStackParamList, 'ThreadDetail'>;
type ThreadDetailNav = NativeStackNavigationProp<RootStackParamList, 'ThreadDetail'>;

export default function ThreadDetailScreen() {
  const route = useRoute<ThreadDetailRoute>();
  const navigation = useNavigation<ThreadDetailNav>();
  const { threadId, title } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [activeChips, setActiveChips] = useState<MemoryChip[]>([]);
  const [suggestedChips, setSuggestedChips] = useState<MemoryChip[]>([]);
  const [pinnedChips, setPinnedChips] = useState<MemoryChip[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({ status: 'idle', cost: 0 });
  const [totalCost, setTotalCost] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const chipDismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Context bar: cost on the right
  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () => (
        <Text style={costStyle}>${totalCost.toFixed(3)}</Text>
      ),
    });
  }, [navigation, title, totalCost]);

  const scheduleChipDismiss = useCallback((chipId: string) => {
    const existing = chipDismissTimers.current.get(chipId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setActiveChips((prev) => prev.filter((c) => c.id !== chipId));
      chipDismissTimers.current.delete(chipId);
    }, 10_000);
    chipDismissTimers.current.set(chipId, timer);
  }, []);

  const dismissAllChips = useCallback(() => {
    for (const t of chipDismissTimers.current.values()) clearTimeout(t);
    chipDismissTimers.current.clear();
    setActiveChips([]);
  }, []);

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
        const payload = JSON.parse(event.data as string) as WsServerEvent;

        if (payload.type === 'message.new') {
          setMessages((current) => [...current, payload.payload.message]);
        } else if (payload.type === 'message') {
          setMessages((current) => [...current, payload.message]);
        } else if (payload.type === 'memory_chip') {
          const chip = payload.chip;
          setActiveChips((prev) => {
            if (prev.some((c) => c.id === chip.id)) return prev;
            return [...prev, chip];
          });
          scheduleChipDismiss(chip.id);
        } else if (payload.type === 'agent_started') {
          setAgentStatus({
            status: 'running',
            agentName: payload.agentName,
            startedAt: Date.now(),
            cost: agentStatus.cost,
          });
        } else if (payload.type === 'agent_completed') {
          setAgentStatus((prev) => ({ ...prev, status: 'idle' }));
        } else if (payload.type === 'cost_incurred') {
          const added = payload.cost;
          setTotalCost((prev) => prev + added);
          setAgentStatus((prev) => ({ ...prev, cost: prev.cost + added }));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const handleInputChange = useCallback((text: string) => {
    setInput(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (text.trim().length < 2) { setSuggestedChips([]); return; }
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${SERVER_URL}/memories?q=${encodeURIComponent(text.trim())}&userId=robin`,
        );
        const results = (await res.json()) as Array<MemoryChip & { score: number }>;
        setSuggestedChips(results.filter((r) => r.score > 0.7));
      } catch {
        setSuggestedChips([]);
      }
    }, 500);
  }, []);

  const handleChipTap = useCallback((chip: MemoryChip) => {
    setInput((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} ${chip.content}` : chip.content;
    });
    setSuggestedChips([]);
  }, []);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content) return;

    dismissAllChips();

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
  }, [input, threadId, dismissAllChips]);

  const handlePinChip = useCallback((chip: MemoryChip) => {
    setPinnedChips((prev) => {
      if (prev.some((c) => c.id === chip.id)) {
        return prev.filter((c) => c.id !== chip.id);
      }
      return [...prev, { ...chip, pinned: true }];
    });
    setActiveChips((prev) => prev.filter((c) => c.id !== chip.id));
  }, []);

  const handleUnpinChip = useCallback((chip: MemoryChip) => {
    setPinnedChips((prev) => prev.filter((c) => c.id !== chip.id));
  }, []);

  const handleDismissChip = useCallback((chip: MemoryChip) => {
    const timer = chipDismissTimers.current.get(chip.id);
    if (timer) {
      clearTimeout(timer);
      chipDismissTimers.current.delete(chip.id);
    }
    setActiveChips((prev) => prev.filter((c) => c.id !== chip.id));
  }, []);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', default: undefined })}
    >
      <ThreadHeader pinnedChips={pinnedChips} onUnpin={handleUnpinChip} />

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

      {activeChips.length > 0 && (
        <View style={styles.chipsBar}>
          {activeChips.map((chip) => (
            <MemoryChipComponent
              key={chip.id}
              chip={chip}
              onPin={handlePinChip}
              onDelete={handleDismissChip}
              onDismiss={handleDismissChip}
            />
          ))}
        </View>
      )}

      <AgentStatusBar agentStatus={agentStatus} />

      {suggestedChips.length > 0 && (
        <View style={styles.suggestionsBar}>
          {suggestedChips.map((chip) => (
            <MemoryChipComponent
              key={chip.id}
              chip={chip}
              onTap={handleChipTap}
              onPin={handlePinChip}
              onDelete={() => setSuggestedChips((prev) => prev.filter((c) => c.id !== chip.id))}
              onDismiss={() => setSuggestedChips((prev) => prev.filter((c) => c.id !== chip.id))}
            />
          ))}
        </View>
      )}

      <View style={styles.composer}>
        <TextInput
          value={input}
          onChangeText={handleInputChange}
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

const costStyle = { fontSize: 13, color: '#999', marginRight: 4 };

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
  chipsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: '#E3F2FD',
    backgroundColor: '#F8FBFF',
  },
  suggestionsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F0F8FF',
    borderTopWidth: 1,
    borderColor: '#D0E8FF',
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
