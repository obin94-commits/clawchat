import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { MemoryChip } from '@clawchat/shared';
import MemoryChipComponent from './MemoryChip';
import { useTheme } from '../ThemeContext';

interface Props {
  pinnedChips: MemoryChip[];
  onUnpin?: (chip: MemoryChip) => void;
}

export default function ThreadHeader({ pinnedChips, onUnpin }: Props) {
  const { theme } = useTheme();
  if (pinnedChips.length === 0) return null;

  const visible = pinnedChips.slice(0, 3);

  return (
    <View style={[styles.container, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {visible.map((chip) => (
          <MemoryChipComponent
            key={chip.id}
            chip={chip}
            onPin={() => onUnpin?.(chip)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
