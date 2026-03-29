import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { MemoryChip } from '@clawchat/shared';
import MemoryChipComponent from './MemoryChip';

interface Props {
  pinnedChips: MemoryChip[];
  onUnpin?: (chip: MemoryChip) => void;
}

export default function ThreadHeader({ pinnedChips, onUnpin }: Props) {
  if (pinnedChips.length === 0) return null;

  const visible = pinnedChips.slice(0, 3);

  return (
    <View style={styles.container}>
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
    borderColor: '#E3F2FD',
    backgroundColor: '#F8FBFF',
    paddingVertical: 6,
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
