export interface Theme {
  bg: string;
  surface: string;
  surfaceHigh: string;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderLight: string;
  // Message bubbles
  bubbleUser: string;
  bubbleAgent: string;
  bubbleSystem: string;
  bubbleTextUser: string;
  bubbleTextAgent: string;
  bubbleTextSystem: string;
  // Input
  inputBg: string;
  inputBorder: string;
  // Status
  success: string;
  error: string;
  warning: string;
  info: string;
  // Agent bar
  agentBarBg: string;
  // Memory chips
  chipBg: string;
  chipText: string;
  chipPinnedBg: string;
  chipPinnedBorder: string;
  // Branch badge
  branchBg: string;
  branchText: string;
  // Drawer
  drawerBg: string;
}

export const darkTheme: Theme = {
  bg: '#1a1a2e',
  surface: '#16213e',
  surfaceHigh: '#1f2d4e',
  primary: '#0f3460',
  accent: '#e94560',
  text: '#eeeeee',
  textMuted: '#aaaaaa',
  textFaint: '#666680',
  border: '#2a2a4a',
  borderLight: '#222240',
  // Message bubbles
  bubbleUser: '#0f3460',
  bubbleAgent: '#16213e',
  bubbleSystem: '#1a1a2e',
  bubbleTextUser: '#eeeeee',
  bubbleTextAgent: '#dddddd',
  bubbleTextSystem: '#888888',
  // Input
  inputBg: '#16213e',
  inputBorder: '#2a2a4a',
  // Status
  success: '#34c759',
  error: '#e94560',
  warning: '#ff9500',
  info: '#0a84ff',
  // Agent bar
  agentBarBg: '#111128',
  // Memory chips
  chipBg: '#0f3460',
  chipText: '#93c5fd',
  chipPinnedBg: '#1e3a5f',
  chipPinnedBorder: '#3b82f6',
  // Branch badge
  branchBg: '#1e1e3f',
  branchText: '#818cf8',
  // Drawer
  drawerBg: '#16213e',
};

export const lightTheme: Theme = {
  bg: '#ffffff',
  surface: '#f8f8f8',
  surfaceHigh: '#f0f0f0',
  primary: '#0f3460',
  accent: '#e94560',
  text: '#111111',
  textMuted: '#666666',
  textFaint: '#999999',
  border: '#e0e0e0',
  borderLight: '#eeeeee',
  // Message bubbles
  bubbleUser: '#0f3460',
  bubbleAgent: '#f2f2f2',
  bubbleSystem: '#f9f9f9',
  bubbleTextUser: '#ffffff',
  bubbleTextAgent: '#111111',
  bubbleTextSystem: '#888888',
  // Input
  inputBg: '#ffffff',
  inputBorder: '#dddddd',
  // Status
  success: '#34c759',
  error: '#ff3b30',
  warning: '#ff9500',
  info: '#007aff',
  // Agent bar
  agentBarBg: '#fafafa',
  // Memory chips
  chipBg: '#e8f4fd',
  chipText: '#1565c0',
  chipPinnedBg: '#bbdefb',
  chipPinnedBorder: '#90caf9',
  // Branch badge
  branchBg: '#eef2ff',
  branchText: '#6366f1',
  // Drawer
  drawerBg: '#ffffff',
};
