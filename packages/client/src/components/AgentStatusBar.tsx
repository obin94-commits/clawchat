import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

export interface AgentStatus {
  status: 'idle' | 'running';
  agentName?: string;
  startedAt?: number;
  cost: number;
}

interface Props {
  agentStatus: AgentStatus;
}

export default function AgentStatusBar({ agentStatus }: Props) {
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

  const label = isRunning
    ? `${agentStatus.agentName ?? 'Agent'} running (${elapsed}s) — $${agentStatus.cost.toFixed(4)}`
    : 'Agent: idle';

  return (
    <View style={styles.bar}>
      {isRunning && (
        <Animated.View style={[styles.dot, { opacity: dotOpacity }]} />
      )}
      <Text style={[styles.label, isRunning && styles.labelActive]}>{label}</Text>
    </View>
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
    backgroundColor: '#007AFF',
  },
  label: {
    fontSize: 12,
    color: '#999',
  },
  labelActive: {
    color: '#007AFF',
  },
});
