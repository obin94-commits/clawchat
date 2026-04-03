import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Settings {
  serverUrl: string;
  apiKey: string;
}

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
}

const DEFAULT_SETTINGS: Settings = {
  serverUrl: process.env['EXPO_PUBLIC_SERVER_URL'] ?? 'http://localhost:3001',
  apiKey: process.env['EXPO_PUBLIC_API_KEY'] ?? '',
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    AsyncStorage.getMany(['clawchat_server_url', 'clawchat_api_key']).then((map) => {
      setSettings({
        serverUrl: (map['clawchat_server_url'] as string | null) ?? DEFAULT_SETTINGS.serverUrl,
        apiKey: (map['clawchat_api_key'] as string | null) ?? DEFAULT_SETTINGS.apiKey,
      });
    }).catch(() => {});
  }, []);

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    const next = { ...settings, ...updates };
    setSettings(next);
    await AsyncStorage.setMany({
      clawchat_server_url: next.serverUrl,
      clawchat_api_key: next.apiKey,
    });
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
