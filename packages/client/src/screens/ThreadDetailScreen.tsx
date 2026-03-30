import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import type { AgentRunInfo, MemoryChip, Message, PersistedMemoryChip, WsServerEvent } from '@clawchat/shared';
import type { RootStackParamList } from '../App';
import MemoryChipComponent from '../components/MemoryChip';
import ThreadHeader from '../components/ThreadHeader';
import AgentStatusBar, { AgentStatus } from '../components/AgentStatusBar';
import SubAgentDrawer from '../components/SubAgentDrawer';

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
  const { threadId, title, parentThreadId } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [activeChips, setActiveChips] = useState<MemoryChip[]>([]);
  const [suggestedChips, setSuggestedChips] = useState<MemoryChip[]>([]);
  const [pinnedChips, setPinnedChips] = useState<MemoryChip[]>([]);
  const [savedChips, setSavedChips] = useState<PersistedMemoryChip[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({ status: 'idle', cost: 0, tokens: 0 });
  const [agents, setAgents] = useState<AgentRunInfo[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [memoryPanelVisible, setMemoryPanelVisible] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const chipDismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerLeft: parentThreadId
        ? () => (
            <Pressable onPress={() => navigation.goBack()} style={{ marginLeft: 0, marginRight: 8 }}>
              <Text style={parentNavStyle}>← parent</Text>
            </Pressable>
          )
        : undefined,
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Pressable onPress={() => setMemoryPanelVisible((v) => !v)}>
            <Text style={memBtnStyle}>mem</Text>
          </Pressable>
          <Text style={costStyle}>${totalCost.toFixed(3)}</Text>
        </View>
      ),
    });
  }, [navigation, title, totalCost, parentThreadId]);

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

  const loadSavedChips = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/threads/${threadId}/memories`);
      if (res.ok) {
        const data = (await res.json()) as PersistedMemoryChip[];
        setSavedChips(data);
      }
    } catch {
      // non-fatal
    }
  }, [threadId]);

  useEffect(() => {
    fetch(`${SERVER_URL}/threads/${threadId}/cost`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setTotalCost(data.totalCostUsd ?? 0);
          setTotalTokens(data.totalTokens ?? 0);
          setAgentStatus((prev) => ({
            ...prev,
            cost: data.totalCostUsd ?? 0,
            tokens: data.totalTokens ?? 0,
          }));
        }
      })
      .catch(() => {});
  }, [threadId]);

  useEffect(() => {
    void loadMessages();
    void loadSavedChips();
  }, [loadMessages, loadSavedChips]);

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
        } else if (payload.type === 'memory_chip.saved') {
          setSavedChips((prev) => {
            if (prev.some((c) => c.id === payload.chip.id)) return prev;
            return [payload.chip, ...prev];
          });
        } else if (payload.type === 'thread.branch') {
          Alert.alert(
            'Branch created',
            `New thread "${payload.childThread.title}" branched from this conversation.`,
            [
              { text: 'Stay here', style: 'cancel' },
              {
                text: 'Go to branch',
                onPress: () =>
                  navigation.push('ThreadDetail', {
                    threadId: payload.childThread.id as string,
                    title: payload.childThread.title,
                    parentThreadId: threadId,
                    branchedFromMessageId: payload.branchedFromMessageId,
                  }),
              },
            ],
          );
        } else if (payload.type === 'agent_started') {
          const { agentName, runId } = payload;
          setAgents((prev) => {
            if (prev.some((a) => a.runId === runId)) return prev;
            return [...prev, { runId, agentName, status: 'running', startedAt: Date.now(), cost: 0, tokens: 0 }];
          });
          setAgentStatus((prev) => ({ ...prev, status: 'running', agentName, startedAt: Date.now() }));
        } else if (payload.type === 'agent_progress') {
          const { agentName, runId, action } = payload;
          setAgents((prev) => prev.map((a) => a.runId === runId ? { ...a, lastAction: action } : a));
          setAgentStatus((prev) => ({ ...prev, status: 'running', agentName }));
        } else if (payload.type === 'agent_completed') {
          const { runId } = payload;
          setAgents((prev) => prev.map((a) => a.runId === runId ? { ...a, status: 'completed', completedAt: Date.now() } : a));
          setAgents((prev) => {
            const stillRunning = prev.filter((a) => a.status === 'running');
            if (stillRunning.length === 0) {
              setAgentStatus((s) => ({ ...s, status: 'idle', error: undefined }));
            } else {
              setAgentStatus((s) => ({
                ...s,
                status: 'running',
                agentName: stillRunning[stillRunning.length - 1]?.agentName,
              }));
            }
            return prev;
          });
        } else if (payload.type === 'agent_failed') {
          const { agentName, runId, error } = payload;
          setAgents((prev) => prev.map((a) => a.runId === runId ? { ...a, status: 'failed', completedAt: Date.now() } : a));
          setAgentStatus((prev) => ({ ...prev, status: 'failed', agentName, error }));
        } else if (payload.type === 'cost_incurred') {
          const added = payload.cost;
          const addedTokens = payload.tokens ?? 0;
          const runId = payload.runId;
          setTotalCost((prev) => prev + added);
          setTotalTokens((prev) => prev + addedTokens);
          setAgentStatus((prev) => ({ ...prev, cost: prev.cost + added, tokens: prev.tokens + addedTokens }));
          if (runId) {
            setAgents((prev) => prev.map((a) =>
              a.runId === runId ? { ...a, cost: a.cost + added, tokens: a.tokens + addedTokens } : a,
            ));
          }
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

  const handleBranchFromMessage = useCallback(async (message: Message) => {
    Alert.prompt(
      'Branch from here',
      'Name for the new branch thread:',
      async (branchTitle) => {
        try {
          const res = await fetch(`${SERVER_URL}/threads/${threadId}/branch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messageId: message.id,
              title: branchTitle || undefined,
            }),
          });
          if (!res.ok) {
            Alert.alert('Error', 'Failed to create branch');
            return;
          }
          const childThread = await res.json();
          navigation.push('ThreadDetail', {
            threadId: childThread.id as string,
            title: childThread.title as string,
            parentThreadId: threadId,
            branchedFromMessageId: message.id,
          });
        } catch {
          Alert.alert('Error', 'Failed to create branch');
        }
      },
      'plain-text',
    );
  }, [threadId, navigation]);

  const handlePinChip = useCallback((chip: MemoryChip) => {
    setPinnedChips((prev) => {
      if (prev.some((c) => c.id === chip.id)) return prev.filter((c) => c.id !== chip.id);
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

  const handleToggleSavedChipPin = useCallback(async (chip: PersistedMemoryChip) => {
    try {
      const res = await fetch(`${SERVER_URL}/threads/${threadId}/memories/${chip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !chip.pinned }),
      });
      if (res.ok) {
        const updated = (await res.json()) as PersistedMemoryChip;
        setSavedChips((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      }
    } catch {
      // non-fatal
    }
  }, [threadId]);

  const handleDeleteSavedChip = useCallback(async (chip: PersistedMemoryChip) => {
    try {
      await fetch(`${SERVER_URL}/threads/${threadId}/memories/${chip.id}`, { method: 'DELETE' });
      setSavedChips((prev) => prev.filter((c) => c.id !== chip.id));
    } catch {
      // non-fatal
    }
  }, [threadId]);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages],
  );

  const isRememberMessage = (content: string) => /^\/remember\s+/i.test(content);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', default: undefined })}
    >
      {/* Parent thread breadcrumb */}
      {parentThreadId && (
        <Pressable style={styles.breadcrumb} onPress={() => navigation.goBack()}>
          <Text style={styles.breadcrumbText}>← back to parent thread</Text>
        </Pressable>
      )}

      <ThreadHeader pinnedChips={pinnedChips} onUnpin={handleUnpinChip} />

      <FlatList
        style={styles.list}
        data={sortedMessages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isGhost = item.displayType !== 'VISIBLE' || item.role === 'SYSTEM' || item.role === 'TOOL';
          const isRemember = isRememberMessage(item.content);

          if (isRemember) {
            const memText = item.content.replace(/^\/remember\s+/i, '').trim();
            return (
              <View style={styles.memoryChipMessage}>
                <Text style={styles.memoryChipIcon}>memory</Text>
                <Text style={styles.memoryChipText}>{memText}</Text>
              </View>
            );
          }

          return (
            <Pressable
              onLongPress={() => {
                if (item.role !== 'SYSTEM' && item.role !== 'TOOL') {
                  Alert.alert(
                    'Message options',
                    item.content.length > 80 ? item.content.slice(0, 80) + '…' : item.content,
                    [
                      { text: 'Branch from here', onPress: () => handleBranchFromMessage(item) },
                      { text: 'Cancel', style: 'cancel' },
                    ],
                  );
                }
              }}
              style={[styles.messageBubble, isGhost && styles.ghostBubble]}
            >
              <Text style={[styles.messageRole, isGhost && styles.ghostText]}>{item.role}</Text>
              <Text style={[styles.messageText, isGhost && styles.ghostText]}>{item.content}</Text>
            </Pressable>
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

      <AgentStatusBar
        agentStatus={agentStatus}
        agents={agents}
        threadName={title}
        onPress={agents.length > 0 || agentStatus.status !== 'idle' ? () => setDrawerVisible(true) : undefined}
      />

      <SubAgentDrawer
        visible={drawerVisible}
        agents={agents}
        totalTokens={totalTokens}
        totalCost={totalCost}
        onClose={() => setDrawerVisible(false)}
      />

      {/* Memory panel — persisted chips */}
      {memoryPanelVisible && (
        <View style={styles.memoryPanel}>
          <View style={styles.memoryPanelHeader}>
            <Text style={styles.memoryPanelTitle}>Memories ({savedChips.length})</Text>
            <Pressable onPress={() => setMemoryPanelVisible(false)}>
              <Text style={styles.memoryPanelClose}>✕</Text>
            </Pressable>
          </View>
          {savedChips.length === 0 ? (
            <Text style={styles.memoryPanelEmpty}>No memories yet. Use /remember &lt;text&gt; to save one.</Text>
          ) : (
            savedChips.map((chip) => (
              <View key={chip.id} style={[styles.savedChipRow, chip.pinned && styles.savedChipPinned]}>
                <Text style={styles.savedChipText} numberOfLines={2}>{chip.text}</Text>
                <Text style={styles.savedChipDate}>{new Date(chip.createdAt).toLocaleDateString()}</Text>
                <View style={styles.savedChipActions}>
                  <Pressable onPress={() => handleToggleSavedChipPin(chip)} style={styles.savedChipBtn}>
                    <Text style={styles.savedChipBtnText}>{chip.pinned ? 'unpin' : 'pin'}</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDeleteSavedChip(chip)} style={styles.savedChipBtn}>
                    <Text style={[styles.savedChipBtnText, { color: '#EF4444' }]}>forget</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      )}

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
          placeholder="Send a message or /remember something"
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
const memBtnStyle = { fontSize: 13, color: '#6366F1', fontWeight: '600' as const, marginRight: 4 };
const parentNavStyle = { fontSize: 13, color: '#6366F1', fontWeight: '600' as const };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  breadcrumb: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#EEF2FF',
    borderBottomWidth: 1,
    borderBottomColor: '#C7D2FE',
  },
  breadcrumbText: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '500',
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
  memoryChipMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignSelf: 'flex-start',
  },
  memoryChipIcon: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  memoryChipText: {
    fontSize: 14,
    color: '#15803D',
    flexShrink: 1,
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
  memoryPanel: {
    maxHeight: 260,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    padding: 12,
  },
  memoryPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  memoryPanelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  memoryPanelClose: {
    fontSize: 14,
    color: '#9CA3AF',
    paddingHorizontal: 4,
  },
  memoryPanelEmpty: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 12,
  },
  savedChipRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 6,
  },
  savedChipPinned: {
    borderColor: '#A5B4FC',
    backgroundColor: '#EEF2FF',
  },
  savedChipText: {
    fontSize: 14,
    color: '#111827',
    marginBottom: 2,
  },
  savedChipDate: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  savedChipActions: {
    flexDirection: 'row',
    gap: 8,
  },
  savedChipBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  savedChipBtnText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
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
