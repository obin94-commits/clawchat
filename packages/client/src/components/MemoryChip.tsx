import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MemoryChip as MemoryChipType } from '@clawchat/shared';

interface Props {
  chip: MemoryChipType;
  onPin?: (chip: MemoryChipType) => void;
  onDelete?: (chip: MemoryChipType) => void;
  onDismiss?: (chip: MemoryChipType) => void;
}

export default function MemoryChip({ chip, onPin, onDelete, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);

  const scorePercent = Math.round(chip.score * 100);
  const truncated = chip.content.length > 60 ? chip.content.slice(0, 57) + '…' : chip.content;

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      onLongPress={() => onPin?.(chip)}
      style={[styles.pill, chip.pinned && styles.pillPinned]}
    >
      {expanded ? (
        <View>
          <Text style={styles.fullContent}>{chip.content}</Text>
          {chip.category && <Text style={styles.meta}>{chip.category} · {scorePercent}%</Text>}
          <View style={styles.actions}>
            <Pressable onPress={() => onPin?.(chip)} style={styles.actionBtn}>
              <Text style={styles.actionText}>{chip.pinned ? 'Unpin' : 'Pin'}</Text>
            </Pressable>
            <Pressable onPress={() => onDelete?.(chip)} style={[styles.actionBtn, styles.deleteBtn]}>
              <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
            </Pressable>
            <Pressable onPress={() => onDismiss?.(chip)} style={styles.actionBtn}>
              <Text style={styles.actionText}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={styles.label} numberOfLines={1}>
          {truncated}
          <Text style={styles.score}> {scorePercent}%</Text>
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: '#E3F2FD',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    maxWidth: 280,
  },
  pillPinned: {
    backgroundColor: '#BBDEFB',
    borderWidth: 1,
    borderColor: '#90CAF9',
  },
  label: {
    fontSize: 12,
    color: '#1565C0',
  },
  score: {
    fontSize: 11,
    color: '#42A5F5',
    fontWeight: '600',
  },
  fullContent: {
    fontSize: 13,
    color: '#0D47A1',
    marginBottom: 4,
  },
  meta: {
    fontSize: 11,
    color: '#5C6BC0',
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
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  actionText: {
    fontSize: 11,
    color: '#1565C0',
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: '#FFEBEE',
  },
  deleteText: {
    color: '#C62828',
  },
});
