import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AgentRunInfo } from '@clawchat/shared';

export interface AgentStatus {
  status: 'idle' | 'running' | 'failed';
  agentName?: string;
  startedAt?: number;
  cost: number;
  tokens: number;
  error?: string;
}

interface Props {
  agentStatus: AgentStatus;
  agents: AgentRunInfo[];
  threadName?: string;
  onPress?: () => void;
}

export default function AgentStatusBar({ agentStatus, agents, threadName, onPress }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const dotOpacity = useRef(new Animated.Value(1)).current;

  // Elapsed timer
  useEffect(() => {
    if (agentStatus.status !== 'running' || !agentStatus.startedAt) {
      setElapsed(0);
      return;
    }

    const tick = () => setElapsed(Math.floor((Date.now() - (agentStatus.startedAt ?? Date.now())) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [agentStatus.status, agentStatus.startedAt]);

  // Animated dot pulse
  useEffect(() => {
    if (agentStatus.status !== 'running') {
      dotOpacity.setValue(0);
      return;
    }

    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 0.2, duration: 500, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [agentStatus.status, dotOpacity]);

  const isRunning = agentStatus.status === 'running';
  const isFailed = agentStatus.status === 'failed';

  const runningCount = agents.filter((a) => a.status === 'running').length;

  const threadPrefix = threadName ? `${threadName} · ` : '';

  let label: string;
  if (isFailed) {
    label = `${threadPrefix}${agentStatus.agentName ?? 'Agent'} failed`;
    if (agentStatus.error) label += ` — ${agentStatus.error.slice(0, 40)}`;
  } else if (isRunning) {
    label = `${threadPrefix}${agentStatus.agentName ?? 'Agent'} (${elapsed}s)`;
    if (runningCount > 1) label += ` +${runningCount - 1} sub-agents`;
  } else {
    label = `${threadPrefix}idle`;
  }

  const dotColor = isFailed ? '#FF3B30' : '#007AFF';

  return (
    <Pressable style={styles.bar} onPress={onPress}>
      {(isRunning || isFailed) && (
        <Animated.View
          style={[styles.dot, { backgroundColor: dotColor, opacity: isFailed ? 1 : dotOpacity }]}
        />
      )}
      <Text style={[styles.label, isRunning && styles.labelActive, isFailed && styles.labelFailed]}>
        {label}
      </Text>
      <View style={styles.spacer} />
      <Text style={styles.costLabel}>
        {agentStatus.tokens > 0 ? `${agentStatus.tokens.toLocaleString()}t · ` : ''}
        ${agentStatus.cost.toFixed(4)}
      </Text>
      {onPress && (
        <Text style={styles.chevron}>{isRunning || isFailed ? '›' : ''}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderColor: '#EEE',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
    color: '#999',
  },
  labelActive: {
    color: '#007AFF',
  },
  labelFailed: {
    color: '#FF3B30',
  },
  spacer: {
    flex: 1,
  },
  costLabel: {
    fontSize: 11,
    color: '#AAA',
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    fontSize: 16,
    color: '#CCC',
    lineHeight: 18,
  },
});
