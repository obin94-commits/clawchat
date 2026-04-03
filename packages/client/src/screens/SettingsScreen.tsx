import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../ThemeContext';
import { useSettings } from '../SettingsContext';

export default function SettingsScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { settings, updateSettings } = useSettings();

  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [saved, setSaved] = useState(false);

  const s = makeStyles(theme);

  const handleSave = async () => {
    await updateSettings({ serverUrl: serverUrl.trim(), apiKey: apiKey.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.select({ ios: 'padding', default: undefined })}
    >
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <Text style={s.sectionTitle}>Connection</Text>

        <View style={s.field}>
          <Text style={s.label}>Server URL</Text>
          <TextInput
            style={s.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://localhost:3001"
            placeholderTextColor={theme.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>API Key</Text>
          <TextInput
            style={s.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="Leave blank for unauthenticated servers"
            placeholderTextColor={theme.textFaint}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Pressable style={[s.saveButton, saved && s.saveButtonDone]} onPress={handleSave}>
          <Text style={s.saveButtonText}>{saved ? '✓ Saved' : 'Save Changes'}</Text>
        </Pressable>

        <View style={s.divider} />

        <Text style={s.sectionTitle}>Appearance</Text>

        <View style={s.row}>
          <Text style={s.rowLabel}>Dark Mode</Text>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: '#767577', true: theme.accent }}
            thumbColor={isDark ? '#f8f8ff' : '#f4f3f4'}
          />
        </View>

        <View style={s.divider} />

        <Text style={s.sectionTitle}>About</Text>
        <Text style={s.aboutText}>ClawChat — iMessage for AI agents</Text>
        <Text style={s.aboutText}>Phase 2 — Client Polish</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    container: { flex: 1, backgroundColor: theme.bg },
    content: { padding: 20 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 12,
      marginTop: 4,
    },
    field: { marginBottom: 16 },
    label: { fontSize: 13, color: theme.textMuted, marginBottom: 6, fontWeight: '500' },
    input: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.text,
    },
    saveButton: {
      backgroundColor: theme.accent,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
      marginBottom: 16,
    },
    saveButtonDone: { backgroundColor: theme.success },
    saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    divider: {
      height: 1,
      backgroundColor: theme.border,
      marginVertical: 24,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 8,
    },
    rowLabel: { fontSize: 15, color: theme.text },
    aboutText: { fontSize: 14, color: theme.textMuted, marginBottom: 4 },
  });
}
