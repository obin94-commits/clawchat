import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkTheme, lightTheme, Theme } from './theme';

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  isDark: true,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('clawchat_theme').then((val) => {
      if (val === 'light') setIsDark(false);
      else setIsDark(true);
    }).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem('clawchat_theme', next ? 'dark' : 'light').catch(() => {});
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: isDark ? darkTheme : lightTheme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
