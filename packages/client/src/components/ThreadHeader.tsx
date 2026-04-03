import React, { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { MemoryChip } from "@clawchat/shared";
import MemoryChipComponent from "./MemoryChip";
import { useTheme } from "../ThemeContext";
import TextInputModal from "./TextInputModal";
import { useSettings } from "../SettingsContext";
import { fetchWithAuth } from "../fetchWithAuth";

interface Props {
  pinnedChips: MemoryChip[];
  onUnpin?: (chip: MemoryChip) => void;
  threadId?: string;
  threadTitle?: string;
  onTitleChange?: (newTitle: string) => void;
}

export default function ThreadHeader({
  pinnedChips,
  onUnpin,
  threadId,
  threadTitle,
  onTitleChange,
}: Props) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const [showRenameModal, setShowRenameModal] = useState(false);
  const s = makeStyles(theme);

  const handleRenameSubmit = useCallback(
    async (newTitle: string) => {
      setShowRenameModal(false);
      if (!threadId) return;

      try {
        await fetchWithAuth(
          `${settings.serverUrl}/threads/${threadId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: newTitle.trim() }),
          },
          settings.apiKey,
        );
        onTitleChange?.(newTitle.trim());
      } catch {
        Alert.alert("Error", "Failed to rename thread");
      }
    },
    [threadId, settings.serverUrl, settings.apiKey, onTitleChange],
  );

  if (pinnedChips.length === 0 && !threadTitle) return null;

  return (
    <View
      style={[
        styles.container,
        { borderBottomColor: theme.border, backgroundColor: theme.surface },
      ]}
    >
      {threadTitle && (
        <Pressable
          onLongPress={() => setShowRenameModal(true)}
          style={s.titleContainer}
        >
          <Text style={s.titleText} numberOfLines={1}>
            {threadTitle}
          </Text>
        </Pressable>
      )}

      {pinnedChips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {pinnedChips.slice(0, 3).map((chip) => (
            <MemoryChipComponent
              key={chip.id}
              chip={chip}
              onPin={() => onUnpin?.(chip)}
            />
          ))}
        </ScrollView>
      )}

      <TextInputModal
        visible={showRenameModal}
        title="Rename Thread"
        placeholder="Enter new title..."
        defaultValue={threadTitle || ""}
        onSubmit={handleRenameSubmit}
        onDismiss={() => setShowRenameModal(false)}
        confirmText="Rename"
      />
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    titleContainer: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    titleText: {
      fontSize: 18,
      fontWeight: "600",
      color: theme.text,
      textAlign: "center",
      flex: 1,
    },
  });
}
