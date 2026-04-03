import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { useTheme } from "../ThemeContext";

interface TextInputModalProps {
  visible: boolean;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  confirmText?: string;
  maxLength?: number;
  onDismiss?: () => void;
}

export default function TextInputModal({
  visible,
  title,
  placeholder,
  defaultValue = "",
  onSubmit,
  onCancel,
  confirmText = "OK",
  maxLength = 200,
  onDismiss,
}: TextInputModalProps) {
  const { theme } = useTheme();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setValue(defaultValue);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [visible, defaultValue]);

  const handleSubmit = useCallback(() => {
    if (value.trim()) {
      onSubmit(value.trim());
      setValue("");
    }
  }, [value, onSubmit]);

  const handleCancel = useCallback(() => {
    setValue(defaultValue);
    onCancel?.();
    onDismiss?.();
  }, [defaultValue, onCancel, onDismiss]);

  if (!visible) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
      <Pressable style={styles.backdrop} onPress={handleCancel} />
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <TextInput
          ref={inputRef}
          style={[styles.input, { 
            backgroundColor: theme.inputBg || theme.background, 
            color: theme.text,
            borderColor: theme.border,
          }]}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={theme.textFaint || "#666"}
          maxLength={maxLength}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />
        <View style={styles.buttons}>
          <Pressable style={[styles.btn, { backgroundColor: theme.primary || "#333" }]} onPress={handleCancel}>
            <Text style={[styles.btnText, { color: theme.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, { backgroundColor: theme.accent || "#e94560", opacity: value.trim() ? 1 : 0.4 }]}
            onPress={handleSubmit}
            disabled={!value.trim()}
          >
            <Text style={[styles.btnText, { color: "#fff" }]}>{confirmText}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute" as any,
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    ...(Platform.OS === "web" ? { position: "fixed" as any } : {}),
  },
  backdrop: {
    position: "absolute" as any,
    top: 0, left: 0, right: 0, bottom: 0,
  },
  card: {
    width: "85%",
    maxWidth: 320,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    zIndex: 10000,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
    minHeight: 48,
  },
  buttons: {
    flexDirection: "row",
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
