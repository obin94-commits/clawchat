import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { AgentRunInfo } from '@clawchat/shared';

interface Props {
  visible: boolean;
  agents: AgentRunInfo[];
  totalTokens: number;
  totalCost: number;
  onClose: () => void;
}

function statusColor(status: AgentRunInfo['status']): string {
  if (status === 'running') return '#007AFF';
  if (status === 'failed') return '#FF3B30';
  return '#34C759';
}

function statusLabel(status: AgentRunInfo['status']): string {
  if (status === 'running') return 'running';
  if (status === 'failed') return 'failed';
  return 'done';
}

function runtime(agent: AgentRunInfo): string {
  const end = agent.completedAt ?? Date.now();
  const secs = Math.floor((end - agent.startedAt) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export default function SubAgentDrawer({ visible, agents, totalTokens, totalCost, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  const runningCount = agents.filter((a) => a.status === 'running').length;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Agents</Text>
            <Text style={styles.subtitle}>
              {runningCount > 0 ? `${runningCount} running` : 'All idle'}
              {' · '}
              {totalTokens.toLocaleString()} tokens
              {' · '}
              ${totalCost.toFixed(4)}
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        {/* Agent list */}
        <ScrollView contentContainerStyle={styles.list}>
          {agents.length === 0 ? (
            <Text style={styles.emptyText}>No agents tracked in this session.</Text>
          ) : (
            agents.map((agent) => (
              <View key={agent.runId} style={styles.row}>
                <View style={[styles.statusDot, { backgroundColor: statusColor(agent.status) }]} />
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.agentName}>{agent.agentName}</Text>
                    <Text style={[styles.statusBadge, { color: statusColor(agent.status) }]}>
                      {statusLabel(agent.status)}
                    </Text>
                  </View>
                  <View style={styles.rowMeta}>
                    <Text style={styles.metaText}>{runtime(agent)}</Text>
                    {agent.lastAction ? (
                      <Text style={styles.metaText} numberOfLines={1}>
                        {agent.lastAction}
                      </Text>
                    ) : null}
                    <Text style={styles.metaCost}>
                      {agent.tokens > 0 ? `${agent.tokens.toLocaleString()}t · ` : ''}
                      ${agent.cost.toFixed(4)}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 40,
    maxHeight: '75%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
  subtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  closeButton: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  closeText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  emptyText: {
    color: '#AAA',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  agentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    flex: 1,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  rowMeta: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 12,
    color: '#888',
  },
  metaCost: {
    fontSize: 12,
    color: '#888',
    fontVariant: ['tabular-nums'],
    marginLeft: 'auto',
  },
});
