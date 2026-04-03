import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MemoryChip as MemoryChipType } from '@clawchat/shared';
import { useTheme } from '../ThemeContext';

interface Props {
  chip: MemoryChipType;
  onPin?: (chip: MemoryChipType) => void;
  onDelete?: (chip: MemoryChipType) => void;
  onDismiss?: (chip: MemoryChipType) => void;
  onTap?: (chip: MemoryChipType) => void;
}

type Mode = 'pill' | 'expanded' | 'options';

export default function MemoryChip({ chip, onPin, onDelete, onDismiss, onTap }: Props) {
  const { theme } = useTheme();
  const [mode, setMode] = useState<Mode>('pill');

  const scorePercent = Math.round(chip.score * 100);
  const truncated = chip.content.length > 60 ? chip.content.slice(0, 57) + '…' : chip.content;

  const handlePress = () => {
    if (mode === 'options') { setMode('pill'); return; }
    if (onTap) { onTap(chip); return; }
    setMode((v) => (v === 'expanded' ? 'pill' : 'expanded'));
  };

  const handleLongPress = () => setMode('options');

  const pillStyle = [
    styles.pill,
    { backgroundColor: theme.chipBg },
    chip.pinned && { backgroundColor: theme.chipPinnedBg, borderWidth: 1, borderColor: theme.chipPinnedBorder },
  ];

  if (mode === 'options') {
    return (
      <View style={[...pillStyle, styles.optionsContainer]}>
        <Text style={[styles.optionsLabel, { color: theme.textMuted }]} numberOfLines={1}>{truncated}</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => { onPin?.(chip); setMode('pill'); }}
            style={[styles.actionBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.actionText, { color: theme.chipText }]}>{chip.pinned ? 'Unpin' : 'Pin to header'}</Text>
          </Pressable>
          <Pressable
            onPress={() => { onDelete?.(chip); }}
            style={[styles.actionBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.actionText, { color: theme.error }]}>Delete</Text>
          </Pressable>
          <Pressable onPress={() => setMode('pill')} style={[styles.actionBtn, { backgroundColor: theme.primary }]}>
            <Text style={[styles.actionText, { color: theme.textMuted }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (mode === 'expanded') {
    return (
      <Pressable onPress={handlePress} onLongPress={handleLongPress} style={pillStyle}>
        <Text style={[styles.fullContent, { color: theme.chipText }]}>{chip.content}</Text>
        {(chip.category || chip.createdAt) && (
          <Text style={[styles.meta, { color: theme.textFaint }]}>
            {[
              chip.category,
              chip.createdAt ? new Date(chip.createdAt).toLocaleDateString() : undefined,
              `${scorePercent}%`,
            ].filter(Boolean).join(' · ')}
          </Text>
        )}
        <View style={styles.actions}>
          {[
            { label: chip.pinned ? 'Unpin' : 'Pin', action: () => { onPin?.(chip); setMode('pill'); } },
            { label: 'Delete', action: () => onDelete?.(chip), danger: true },
            { label: 'Dismiss', action: () => onDismiss?.(chip) },
          ].map(({ label, action, danger }) => (
            <Pressable key={label} onPress={action} style={[styles.actionBtn, { backgroundColor: theme.primary }]}>
              <Text style={[styles.actionText, { color: danger ? theme.error : theme.chipText }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={handlePress} onLongPress={handleLongPress} style={pillStyle}>
      <Text style={[styles.label, { color: theme.chipText }]} numberOfLines={1}>
        {truncated}
        <Text style={[styles.score, { color: theme.accent }]}> {scorePercent}%</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    maxWidth: 300,
  },
  optionsContainer: {
    maxWidth: 320,
  },
  optionsLabel: {
    fontSize: 11,
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
  },
  score: {
    fontSize: 11,
    fontWeight: '600',
  },
  fullContent: {
    fontSize: 13,
    marginBottom: 4,
  },
  meta: {
    fontSize: 11,
    marginBottom: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
