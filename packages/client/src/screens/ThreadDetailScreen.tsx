import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Clipboard,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Markdown from 'react-native-markdown-display';
import type {
  AgentRunInfo,
  MemoryChip,
  Message,
  PersistedMemoryChip,
  WsServerEvent,
} from '@clawchat/shared';
import type { RootStackParamList } from '../App';
import MemoryChipComponent from '../components/MemoryChip';
import ThreadHeader from '../components/ThreadHeader';
import AgentStatusBar, { AgentStatus } from '../components/AgentStatusBar';
import SubAgentDrawer from '../components/SubAgentDrawer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useTheme } from '../ThemeContext';
import { useSettings } from '../SettingsContext';

type ThreadDetailRoute = RouteProp<RootStackParamList, 'ThreadDetail'>;
type ThreadDetailNav = NativeStackNavigationProp<RootStackParamList, 'ThreadDetail'>;

// Exponential backoff reconnect
function useReconnectingWebSocket(
  url: string,
  onMessage: (event: WsServerEvent) => void,
  threadId: string,
) {
  const socketRef = useRef<WebSocket | null>(null);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const connect = useCallback(() => {
    if (!mounted.current) return;
    try {
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        retryCount.current = 0;
        ws.send(JSON.stringify({ type: 'subscribe', threadId }));
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as WsServerEvent;
          onMessage(payload);
        } catch {
          console.error('WS parse error');
        }
      };

      ws.onerror = () => {
        console.warn('[WS] error');
      };

      ws.onclose = () => {
        if (!mounted.current) return;
        const delay = Math.min(30000, 1000 * 2 ** retryCount.current);
        retryCount.current += 1;
        console.log(`[WS] reconnecting in ${delay}ms (attempt ${retryCount.current})`);
        retryTimer.current = setTimeout(connect, delay);
      };
    } catch (e) {
      console.error('[WS] connect error', e);
    }
  }, [url, threadId, onMessage]);

  useEffect(() => {
    mounted.current = true;
    connect();
    return () => {
      mounted.current = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  return socketRef;
}

// Typing indicator dots
function TypingIndicator({ theme }: { theme: ReturnType<typeof useTheme>['theme'] }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeBounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ]),
      );
    const a1 = makeBounce(dot1, 0);
    const a2 = makeBounce(dot2, 200);
    const a3 = makeBounce(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 12, alignItems: 'center' }}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: theme.textFaint,
            transform: [{ translateY: dot }],
          }}
        />
      ))}
    </View>
  );
}

// Long-press message action menu
interface MessageMenuProps {
  visible: boolean;
  message: Message | null;
  onClose: () => void;
  onCopy: () => void;
  onBranch: () => void;
  onReply: () => void;
  theme: ReturnType<typeof useTheme>['theme'];
}

function MessageMenu({ visible, message, onClose, onCopy, onBranch, onReply, theme }: MessageMenuProps) {
  if (!message) return null;
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose}>
        <View style={{
          position: 'absolute',
          bottom: 100,
          left: 20,
          right: 20,
          backgroundColor: theme.surface,
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.border,
        }}>
          <Text style={{
            fontSize: 13,
            color: theme.textMuted,
            padding: 14,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
          }} numberOfLines={2}>
            {message.content.length > 80 ? message.content.slice(0, 80) + '…' : message.content}
          </Text>
          {[
            { label: '📋  Copy', action: onCopy },
            { label: '↩️  Reply', action: onReply },
            { label: '⤷  Branch from here', action: onBranch },
          ].map(({ label, action }) => (
            <Pressable
              key={label}
              onPress={() => { action(); onClose(); }}
              style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border }}
            >
              <Text style={{ fontSize: 16, color: theme.text }}>{label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 16, color: theme.textMuted, textAlign: 'center' }}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function ThreadDetailContent() {
  const route = useRoute<ThreadDetailRoute>();
  const navigation = useNavigation<ThreadDetailNav>();
  const { theme } = useTheme();
  const { settings } = useSettings();
  const SERVER_URL = settings.serverUrl;
  const WS_URL = SERVER_URL.replace(/^http/, 'ws');

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
  const [isTyping, setIsTyping] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  // Long-press menu
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);

  // Pagination
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const chipDismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const s = makeStyles(theme);

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerLeft: parentThreadId
        ? () => (
            <Pressable onPress={() => navigation.goBack()} style={{ marginLeft: 0, marginRight: 8 }}>
              <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' as const }}>← parent</Text>
            </Pressable>
          )
        : undefined,
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Pressable onPress={() => setMemoryPanelVisible((v) => !v)}>
            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' as const, marginRight: 4 }}>mem</Text>
          </Pressable>
          <Text style={{ fontSize: 13, color: theme.textMuted, marginRight: 4 }}>${totalCost.toFixed(3)}</Text>
        </View>
      ),
    });
  }, [navigation, title, totalCost, parentThreadId, theme]);

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

  const loadMessages = useCallback(async (beforeCursor?: string) => {
    try {
      const url = beforeCursor
        ? `${SERVER_URL}/threads/${threadId}/messages?before=${beforeCursor}&limit=30`
        : `${SERVER_URL}/threads/${threadId}/messages?limit=30`;
      const response = await fetch(url);
      const data = (await response.json()) as Message[];
      if (beforeCursor) {
        setMessages((prev) => [...data, ...prev]);
        if (data.length < 30) setHasMore(false);
        if (data.length > 0) setCursor(data[0].id);
      } else {
        setMessages(data);
        if (data.length < 30) setHasMore(false);
        if (data.length > 0) setCursor(data[0].id);
      }
    } catch (error) {
      console.error('Failed to load messages', error);
    }
  }, [threadId, SERVER_URL]);

  const loadSavedChips = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/threads/${threadId}/memories`);
      if (res.ok) {
        const data = (await res.json()) as PersistedMemoryChip[];
        setSavedChips(data);
      }
    } catch { /* non-fatal */ }
  }, [threadId, SERVER_URL]);

  useEffect(() => {
    fetch(`${SERVER_URL}/threads/${threadId}/cost`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setTotalCost(data.totalCostUsd ?? 0);
          setTotalTokens(data.totalTokens ?? 0);
          setAgentStatus((prev) => ({ ...prev, cost: data.totalCostUsd ?? 0, tokens: data.totalTokens ?? 0 }));
        }
      })
      .catch(() => {});
  }, [threadId, SERVER_URL]);

  useEffect(() => {
    void loadMessages();
    void loadSavedChips();
  }, [loadMessages, loadSavedChips]);

  // Scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  const handleWsMessage = useCallback((payload: WsServerEvent) => {
    if (payload.type === 'message.new') {
      setMessages((current) => {
        if (current.some((m) => m.id === payload.payload.message.id)) return current;
        return [...current, payload.payload.message];
      });
      scrollToBottom();
    } else if (payload.type === 'message') {
      setMessages((current) => {
        if (current.some((m) => m.id === payload.message.id)) return current;
        return [...current, payload.message];
      });
      scrollToBottom();
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
      setIsTyping(true);
    } else if (payload.type === 'agent_progress') {
      const { agentName, runId, action } = payload;
      setAgents((prev) => prev.map((a) => a.runId === runId ? { ...a, lastAction: action } : a));
      setAgentStatus((prev) => ({ ...prev, status: 'running', agentName }));
      setIsTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setIsTyping(false), 3000);
    } else if (payload.type === 'agent_completed') {
      const { runId } = payload;
      setAgents((prev) => prev.map((a) => a.runId === runId ? { ...a, status: 'completed', completedAt: Date.now() } : a));
      setAgents((prev) => {
        const stillRunning = prev.filter((a) => a.status === 'running');
        if (stillRunning.length === 0) {
          setAgentStatus((s) => ({ ...s, status: 'idle', error: undefined }));
          setIsTyping(false);
        }
        return prev;
      });
    } else if (payload.type === 'agent_failed') {
      const { agentName, runId, error } = payload;
      setAgents((prev) => prev.map((a) => a.runId === runId ? { ...a, status: 'failed', completedAt: Date.now() } : a));
      setAgentStatus((prev) => ({ ...prev, status: 'failed', agentName, error }));
      setIsTyping(false);
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
  }, [threadId, navigation, scheduleChipDismiss, scrollToBottom]);

  const socketRef = useReconnectingWebSocket(WS_URL, handleWsMessage, threadId);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !cursor) return;
    setLoadingMore(true);
    await loadMessages(cursor);
    setLoadingMore(false);
  }, [hasMore, loadingMore, cursor, loadMessages]);

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
  }, [SERVER_URL]);

  const handleChipTap = useCallback((chip: MemoryChip) => {
    setInput((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} ${chip.content}` : chip.content;
    });
    setSuggestedChips([]);
  }, []);

  const sendMessage = useCallback(async () => {
    const content = replyTo
      ? `> ${replyTo.content.slice(0, 60)}${replyTo.content.length > 60 ? '…' : ''}\n\n${input.trim()}`
      : input.trim();
    if (!content) return;

    dismissAllChips();
    setReplyTo(null);

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
        const message = (await response.json()) as Message;
        setMessages((current) => [...current, message]);
      }
      setInput('');
      scrollToBottom();
    } catch (error) {
      console.error('Failed to send message', error);
    }
  }, [input, threadId, dismissAllChips, socketRef, SERVER_URL, scrollToBottom, replyTo]);

  const handleBranchFromMessage = useCallback(async (message: Message) => {
    Alert.prompt(
      'Branch from here',
      'Name for the new branch thread:',
      async (branchTitle) => {
        try {
          const res = await fetch(`${SERVER_URL}/threads/${threadId}/branch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId: message.id, title: branchTitle || undefined }),
          });
          if (!res.ok) { Alert.alert('Error', 'Failed to create branch'); return; }
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
  }, [threadId, navigation, SERVER_URL]);

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
    if (timer) { clearTimeout(timer); chipDismissTimers.current.delete(chip.id); }
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
    } catch { /* non-fatal */ }
  }, [threadId, SERVER_URL]);

  const handleDeleteSavedChip = useCallback(async (chip: PersistedMemoryChip) => {
    try {
      await fetch(`${SERVER_URL}/threads/${threadId}/memories/${chip.id}`, { method: 'DELETE' });
      setSavedChips((prev) => prev.filter((c) => c.id !== chip.id));
    } catch { /* non-fatal */ }
  }, [threadId, SERVER_URL]);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages],
  );

  const isRememberMessage = (content: string) => /^\/remember\s+/i.test(content);

  const markdownStyles = useMemo(() => ({
    body: { color: theme.text, fontSize: 15, lineHeight: 22 },
    code_inline: {
      backgroundColor: theme.primary,
      color: '#93c5fd',
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 13,
      paddingHorizontal: 4,
      borderRadius: 4,
    },
    fence: {
      backgroundColor: '#0d1b2e',
      borderRadius: 8,
      padding: 12,
      marginVertical: 6,
    },
    code_block: {
      backgroundColor: '#0d1b2e',
      color: '#93c5fd',
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 13,
      borderRadius: 8,
      padding: 12,
    },
    blockquote: {
      backgroundColor: theme.surfaceHigh ?? theme.surface,
      borderLeftColor: theme.accent,
      borderLeftWidth: 3,
      paddingLeft: 10,
      marginVertical: 4,
    },
    link: { color: theme.accent },
    strong: { color: theme.text, fontWeight: '700' as const },
    em: { color: theme.textMuted, fontStyle: 'italic' as const },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    list_item: { marginVertical: 2 },
    hr: { backgroundColor: theme.border },
    heading1: { color: theme.text, fontWeight: '700' as const, fontSize: 20 },
    heading2: { color: theme.text, fontWeight: '700' as const, fontSize: 18 },
    heading3: { color: theme.text, fontWeight: '600' as const, fontSize: 16 },
  }), [theme]);

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.select({ ios: 'padding', default: undefined })}
    >
      {parentThreadId && (
        <Pressable style={s.breadcrumb} onPress={() => navigation.goBack()}>
          <Text style={s.breadcrumbText}>← back to parent thread</Text>
        </Pressable>
      )}

      <ThreadHeader pinnedChips={pinnedChips} onUnpin={handleUnpinChip} />

      <FlatList
        ref={flatListRef}
        style={s.list}
        data={sortedMessages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isTyping ? (
            <View style={[s.messageBubble, { alignSelf: 'flex-start', marginTop: 4 }]}>
              <TypingIndicator theme={theme} />
            </View>
          ) : null
        }
        ListHeaderComponent={
          loadingMore ? (
            <View style={{ padding: 12, alignItems: 'center' }}>
              <Text style={{ color: theme.textFaint, fontSize: 12 }}>Loading older messages…</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isGhost = item.displayType !== 'VISIBLE' || item.role === 'SYSTEM' || item.role === 'TOOL';
          const isRemember = isRememberMessage(item.content);
          const isUser = item.role === 'USER';

          if (isRemember) {
            const memText = item.content.replace(/^\/remember\s+/i, '').trim();
            return (
              <View style={s.memoryChipMessage}>
                <Text style={s.memoryChipIcon}>memory</Text>
                <Text style={s.memoryChipText}>{memText}</Text>
              </View>
            );
          }

          const bubbleBg = isUser
            ? theme.bubbleUser
            : isGhost
            ? theme.surfaceHigh ?? theme.surface
            : theme.bubbleAgent;

          const textColor = isUser
            ? theme.bubbleTextUser
            : isGhost
            ? theme.textFaint
            : theme.bubbleTextAgent;

          return (
            <Pressable
              onLongPress={() => {
                if (item.role !== 'SYSTEM' && item.role !== 'TOOL') {
                  setMenuMessage(item);
                  setMenuVisible(true);
                }
              }}
              style={[
                s.messageBubble,
                { backgroundColor: bubbleBg, alignSelf: isUser ? 'flex-end' : 'flex-start' },
                isGhost && s.ghostBubble,
              ]}
            >
              {!isUser && (
                <Text style={[s.messageRole, { color: isGhost ? theme.textFaint : theme.textMuted }]}>
                  {item.role}
                </Text>
              )}
              <Markdown style={markdownStyles as any}>
                {item.content}
              </Markdown>
            </Pressable>
          );
        }}
      />

      {activeChips.length > 0 && (
        <View style={s.chipsBar}>
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

      {memoryPanelVisible && (
        <View style={s.memoryPanel}>
          <View style={s.memoryPanelHeader}>
            <Text style={s.memoryPanelTitle}>Memories ({savedChips.length})</Text>
            <Pressable onPress={() => setMemoryPanelVisible(false)}>
              <Text style={s.memoryPanelClose}>✕</Text>
            </Pressable>
          </View>
          {savedChips.length === 0 ? (
            <Text style={s.memoryPanelEmpty}>No memories yet. Use /remember &lt;text&gt; to save one.</Text>
          ) : (
            savedChips.map((chip) => (
              <View key={chip.id} style={[s.savedChipRow, chip.pinned && s.savedChipPinned]}>
                <Text style={s.savedChipText} numberOfLines={2}>{chip.text}</Text>
                <Text style={s.savedChipDate}>{new Date(chip.createdAt).toLocaleDateString()}</Text>
                <View style={s.savedChipActions}>
                  <Pressable onPress={() => handleToggleSavedChipPin(chip)} style={s.savedChipBtn}>
                    <Text style={s.savedChipBtnText}>{chip.pinned ? 'unpin' : 'pin'}</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDeleteSavedChip(chip)} style={s.savedChipBtn}>
                    <Text style={[s.savedChipBtnText, { color: theme.error }]}>forget</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {suggestedChips.length > 0 && (
        <View style={s.suggestionsBar}>
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

      {/* Reply indicator */}
      {replyTo && (
        <View style={s.replyBar}>
          <Text style={s.replyBarText} numberOfLines={1}>
            ↩ Replying: {replyTo.content.slice(0, 60)}
          </Text>
          <Pressable onPress={() => setReplyTo(null)}>
            <Text style={{ color: theme.textMuted, fontSize: 16 }}>✕</Text>
          </Pressable>
        </View>
      )}

      <View style={s.composer}>
        <TextInput
          value={input}
          onChangeText={handleInputChange}
          placeholder="Send a message or /remember something"
          placeholderTextColor={theme.textFaint}
          style={s.input}
          multiline
          maxLength={4000}
        />
        <Pressable onPress={sendMessage} style={s.sendButton}>
          <Text style={s.sendButtonText}>↑</Text>
        </Pressable>
      </View>

      <MessageMenu
        visible={menuVisible}
        message={menuMessage}
        onClose={() => setMenuVisible(false)}
        onCopy={() => {
          if (menuMessage) {
            Clipboard.setString(menuMessage.content);
          }
        }}
        onReply={() => {
          if (menuMessage) setReplyTo(menuMessage);
        }}
        onBranch={() => {
          if (menuMessage) void handleBranchFromMessage(menuMessage);
        }}
        theme={theme}
      />
    </KeyboardAvoidingView>
  );
}

export default function ThreadDetailScreen() {
  return (
    <ErrorBoundary>
      <ThreadDetailContent />
    </ErrorBoundary>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    breadcrumb: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      backgroundColor: theme.primary,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    breadcrumbText: {
      fontSize: 12,
      color: theme.accent,
      fontWeight: '500',
    },
    list: {
      flex: 1,
    },
    listContent: {
      padding: 12,
      gap: 8,
      paddingBottom: 20,
    },
    messageBubble: {
      padding: 12,
      borderRadius: 16,
      maxWidth: '85%',
    },
    ghostBubble: {
      opacity: 0.45,
    },
    messageRole: {
      fontSize: 10,
      fontWeight: '700',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    memoryChipMessage: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: '#0d2a1a',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#1a4d2e',
      alignSelf: 'flex-start',
    },
    memoryChipIcon: {
      fontSize: 11,
      color: '#34c759',
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    memoryChipText: {
      fontSize: 14,
      color: '#86efac',
      flexShrink: 1,
    },
    chipsBar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    suggestionsBar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.surfaceHigh ?? theme.surface,
      borderTopWidth: 1,
      borderColor: theme.border,
    },
    memoryPanel: {
      maxHeight: 260,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.surface,
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
      color: theme.text,
    },
    memoryPanelClose: {
      fontSize: 14,
      color: theme.textMuted,
      paddingHorizontal: 4,
    },
    memoryPanelEmpty: {
      fontSize: 13,
      color: theme.textMuted,
      textAlign: 'center',
      paddingVertical: 12,
    },
    savedChipRow: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: theme.surfaceHigh ?? theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 6,
    },
    savedChipPinned: {
      borderColor: theme.accent,
    },
    savedChipText: {
      fontSize: 14,
      color: theme.text,
      marginBottom: 2,
    },
    savedChipDate: {
      fontSize: 11,
      color: theme.textFaint,
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
      backgroundColor: theme.primary,
    },
    savedChipBtnText: {
      fontSize: 12,
      color: theme.text,
      fontWeight: '500',
    },
    replyBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: theme.primary,
      borderTopWidth: 1,
      borderColor: theme.border,
    },
    replyBarText: {
      flex: 1,
      fontSize: 13,
      color: theme.textMuted,
      fontStyle: 'italic',
    },
    composer: {
      flexDirection: 'row',
      gap: 8,
      padding: 12,
      borderTopWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'flex-end',
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: theme.text,
      backgroundColor: theme.inputBg,
      maxHeight: 120,
    },
    sendButton: {
      backgroundColor: theme.accent,
      borderRadius: 20,
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 18,
    },
  });
}
