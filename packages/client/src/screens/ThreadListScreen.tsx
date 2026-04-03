import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Thread } from "@clawchat/shared";
import type { RootStackParamList } from "../App";
import { useTheme } from "../ThemeContext";
import { useSettings } from "../SettingsContext";
import { fetchWithAuth } from "../fetchWithAuth";
import { ErrorBoundary } from "../components/ErrorBoundary";
import TextInputModal from "../components/TextInputModal";

type Navigation = NativeStackNavigationProp<RootStackParamList, "ThreadList">;

interface ThreadWithPreview extends Thread {
  lastMessage?: string;
  unreadCount?: number;
}

function ThreadListContent() {
  const navigation = useNavigation<Navigation>();
  const { theme } = useTheme();
  const { settings } = useSettings();
  const SERVER_URL = settings.serverUrl;

  const [threads, setThreads] = useState<ThreadWithPreview[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const s = makeStyles(theme);

  const loadThreads = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetchWithAuth(
        `${SERVER_URL}/threads`,
        {},
        settings.apiKey,
      );
      const data = (await response.json()) as ThreadWithPreview[];
      setThreads(data);
>>>>>>> REPPLACCE
```

Wait, looking at the provided code for `ThreadListScreen.tsx`:
```typescript
      const data = (await response.json()) as ThreadWithPreview[];
      data.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      setThreads(data);
```
It is already doing exactly what you requested in point 1. If you meant to *add* it because you thought it was missing, it is already there. If you want me to change how it's sorted, please let me know.

However, I will proceed with the second change in `ThreadDetailScreen.tsx`.

packages/client/src/screens/ThreadDetailScreen.tsx
```python
<<<<<<< SEARCH
              <Markdown style={markdownStyles as any}>{item.content}</Markdown>
            </Pressable>
    } catch (error) {
      console.error("Failed to load threads", error);
    } finally {
      setRefreshing(false);
    }
  }, [SERVER_URL, settings.apiKey]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.lastMessage ?? "").toLowerCase().includes(q),
    );
  }, [threads, searchQuery]);

  const handleDelete = useCallback(
    async (threadId: string) => {
      Alert.alert(
        "Delete Thread",
        "Are you sure you want to delete this thread?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await fetchWithAuth(
                  `${SERVER_URL}/threads/${threadId}`,
                  { method: "DELETE" },
                  settings.apiKey,
                );
                setThreads((prev) => prev.filter((t) => t.id !== threadId));
              } catch {
                Alert.alert("Error", "Failed to delete thread");
              }
            },
          },
        ],
      );
    },
    [SERVER_URL, settings.apiKey],
  );

  const handleCreate = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  const handleCreateSubmit = useCallback(
    async (title: string) => {
      setShowCreateModal(false);
      setCreating(true);
      try {
        const res = await fetchWithAuth(
          `${SERVER_URL}/threads`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: title.trim() }),
          },
          settings.apiKey,
        );
        const thread = (await res.json()) as ThreadWithPreview;
        setThreads((prev) => [thread, ...prev]);
        navigation.navigate("ThreadDetail", {
          threadId: thread.id,
          title: thread.title,
          parentThreadId: undefined,
          branchedFromMessageId: undefined,
        });
      } catch {
        Alert.alert("Error", "Failed to create thread");
      } finally {
        setCreating(false);
      }
    },
    [SERVER_URL, navigation, settings.apiKey],
  );

  function highlightText(text: string, query: string) {
    if (!query.trim()) return <Text style={s.threadTitle}>{text}</Text>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <Text style={s.threadTitle}>{text}</Text>;
    return (
      <Text style={s.threadTitle}>
        {text.slice(0, idx)}
        <Text style={s.highlight}>{text.slice(idx, idx + query.length)}</Text>
        {text.slice(idx + query.length)}
      </Text>
    );
  }

  function formatTime(date: Date | string) {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / (1000 * 60 * 60);
    if (diffH < 24)
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffH < 48) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <View style={s.container}>
      {/* Search Bar */}
      <View style={s.searchContainer}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search threads…"
          placeholderTextColor={theme.textFaint}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filteredThreads}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadThreads}
            tintColor={theme.accent}
          />
        }
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={s.emptyEmoji}>🚀</Text>
            <Text style={s.emptyTitle}>
              {searchQuery
                ? "No threads match your search"
                : "Welcome to ClawChat!"}
            </Text>
            {!searchQuery && (
              <>
                <Text style={s.emptySubtitle}>
                  Start a conversation with an AI agent to get help with coding,
                  analysis, and more.
                </Text>
                <Pressable
                  style={s.emptyButton}
                  onPress={handleCreate}
                  disabled={creating}
                >
                  <Text style={s.emptyButtonText}>Start a conversation</Text>
                </Pressable>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <SwipeableThreadCard
            item={item}
            onPress={() =>
              navigation.navigate("ThreadDetail", {
                threadId: item.id,
                title: item.title,
                parentThreadId: item.parentThreadId ?? undefined,
                branchedFromMessageId: item.branchedFromMessageId ?? undefined,
              })
            }
            onDelete={() => handleDelete(item.id)}
            theme={theme}
            searchQuery={searchQuery}
            highlightText={highlightText}
            formatTime={formatTime}
          />
        )}
      />

      {/* FAB — New Thread */}
      <Pressable
        style={[s.fab, creating && s.fabDisabled]}
        onPress={handleCreate}
        disabled={creating}
      >
        <Text style={s.fabText}>+</Text>
      </Pressable>

      <TextInputModal
        visible={showCreateModal}
        title="New Thread"
        placeholder="Enter thread title..."
        onSubmit={handleCreateSubmit}
        onDismiss={() => setShowCreateModal(false)}
      />
    </View>
  );
}

interface SwipeableCardProps {
  item: ThreadWithPreview;
  onPress: () => void;
  onDelete: () => void;
  theme: ReturnType<typeof useTheme>["theme"];
  searchQuery: string;
  highlightText: (text: string, query: string) => React.ReactNode;
  formatTime: (date: Date | string) => string;
}

function SwipeableThreadCard({
  item,
  onPress,
  onDelete,
  theme,
  searchQuery,
  highlightText,
  formatTime,
}: SwipeableCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const SWIPE_THRESHOLD = -80;

  const s = makeStyles(theme);

  const onSwipeEnd = (dx: number) => {
    if (dx < SWIPE_THRESHOLD) {
      Animated.spring(translateX, {
        toValue: SWIPE_THRESHOLD,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    }
  };

  return (
    <View style={s.swipeContainer}>
      {/* Delete action behind the card */}
      <TouchableOpacity style={s.deleteAction} onPress={onDelete}>
        <Text style={s.deleteActionText}>Delete</Text>
      </TouchableOpacity>

      <Animated.View style={{ transform: [{ translateX }] }}>
        <Pressable
          onPress={() => {
            // If swiped open, snap back; else navigate
            // @ts-ignore — we check the internal value
            const val = (translateX as any)._value as number;
            if (val < -20) {
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
              }).start();
            } else {
              onPress();
            }
          }}
          onLongPress={() => onDelete()}
          style={s.threadCard}
        >
          <View style={s.cardRow}>
            <View style={s.cardLeft}>
              {item.parentThreadId && (
                <View style={s.branchBadge}>
                  <Text style={s.branchBadgeText}>⤷ branch</Text>
                </View>
              )}
              {highlightText(item.title, searchQuery)}
              {item.lastMessage ? (
                <Text style={s.threadPreview} numberOfLines={1}>
                  {item.lastMessage}
                </Text>
              ) : null}
            </View>
            <View style={s.cardRight}>
              <Text style={s.threadMeta}>{formatTime(item.updatedAt)}</Text>
              {item.unreadCount ? (
                <View style={s.unreadBadge}>
                  <Text style={s.unreadBadgeText}>{item.unreadCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function ThreadListScreen() {
  return (
    <ErrorBoundary>
      <ThreadListContent />
    </ErrorBoundary>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      margin: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 8,
    },
    searchIcon: { fontSize: 14 },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: theme.text,
    },
    swipeContainer: {
      position: "relative",
      marginHorizontal: 12,
      marginBottom: 8,
    },
    deleteAction: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      width: 80,
      backgroundColor: "#e94560",
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    deleteActionText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 13,
    },
    threadCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    cardLeft: {
      flex: 1,
    },
    cardRight: {
      alignItems: "flex-end",
      gap: 6,
      minWidth: 50,
    },
    branchBadge: {
      alignSelf: "flex-start",
      backgroundColor: theme.branchBg,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginBottom: 4,
    },
    branchBadgeText: {
      fontSize: 11,
      color: theme.branchText,
      fontWeight: "600",
    },
    threadTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.text,
      marginBottom: 3,
    },
    threadPreview: {
      fontSize: 13,
      color: theme.textMuted,
    },
    threadMeta: {
      color: theme.textFaint,
      fontSize: 12,
    },
    unreadBadge: {
      backgroundColor: theme.accent,
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
      minWidth: 20,
      alignItems: "center",
    },
    unreadBadgeText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "700",
    },
    highlight: {
      backgroundColor: theme.accent,
      color: "#fff",
      borderRadius: 2,
    },
    emptyState: {
      alignItems: "center",
      paddingTop: 80,
      paddingHorizontal: 32,
    },
    emptyEmoji: {
      fontSize: 48,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: theme.text,
      textAlign: "center",
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.textMuted,
      textAlign: "center",
      marginBottom: 24,
    },
    emptyButton: {
      backgroundColor: theme.accent,
      borderRadius: 24,
      paddingHorizontal: 28,
      paddingVertical: 14,
      alignItems: "center",
      shadowColor: theme.accent,
      shadowOpacity: 0.4,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 8,
      elevation: 4,
    },
    emptyButtonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "600",
    },
    fab: {
      position: "absolute",
      bottom: 28,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 8,
      elevation: 6,
    },
    fabDisabled: { opacity: 0.5 },
    fabText: {
      color: "#fff",
      fontSize: 28,
      lineHeight: 32,
      fontWeight: "300",
    },
  });
}
