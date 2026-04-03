import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AgentRunInfo } from '@clawchat/shared';
import { useTheme } from '../ThemeContext';

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
  const { theme } = useTheme();
  const [elapsed, setElapsed] = useState(0);
  const dotOpacity = useRef(new Animated.Value(1)).current;

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

  const dotColor = isFailed ? theme.error : theme.info;

  return (
    <Pressable
      style={[styles.bar, { backgroundColor: theme.agentBarBg, borderColor: theme.border }]}
      onPress={onPress}
    >
      {(isRunning || isFailed) && (
        <Animated.View
          style={[styles.dot, { backgroundColor: dotColor, opacity: isFailed ? 1 : dotOpacity }]}
        />
      )}
      <Text style={[styles.label, { color: theme.textMuted }, isRunning && { color: theme.info }, isFailed && { color: theme.error }]}>
        {label}
      </Text>
      <View style={styles.spacer} />
      <Text style={[styles.costLabel, { color: theme.textFaint }]}>
        {agentStatus.tokens > 0 ? `${agentStatus.tokens.toLocaleString()}t · ` : ''}
        ${agentStatus.cost.toFixed(4)}
      </Text>
      {onPress && (
        <Text style={[styles.chevron, { color: theme.textFaint }]}>{isRunning || isFailed ? '›' : ''}</Text>
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
    borderTopWidth: 1,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
  },
  spacer: {
    flex: 1,
  },
  costLabel: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    fontSize: 16,
    lineHeight: 18,
  },
});
