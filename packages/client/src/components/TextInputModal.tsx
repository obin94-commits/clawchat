import React, { useCallback, useRef, useState } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
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
  const s = makeStyles(theme);

  const handleDismiss = useCallback(() => {
    onDismiss?.();
    setValue(defaultValue);
  }, [defaultValue, onDismiss]);

  const handleSubmit = useCallback(() => {
    if (value.trim()) {
      onSubmit(value.trim());
    }
    Keyboard.dismiss();
    handleDismiss();
  }, [value, onSubmit, handleDismiss]);

  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    onCancel?.();
    handleDismiss();
  }, [onCancel, handleDismiss]);

  React.useEffect(() => {
    if (visible) {
      setValue(defaultValue);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [visible, defaultValue]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleCancel}
    >
      <View style={s.overlay}>
        <Pressable
          style={s.overlayDismiss}
          onPress={handleCancel}
        />
        <View style={s.modalContent}>
          <Text style={s.modalTitle}>{title}</Text>

          <TextInput
            ref={inputRef}
            style={s.input}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={theme.textFaint}
            maxLength={maxLength}
            autoFocus
            blurOnSubmit
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            selectTextOnFocus
          />

          <View style={s.buttonRow}>
            <Pressable
              style={[s.button, s.cancelButton]}
              onPress={handleCancel}
            >
              <Text style={[s.buttonText, s.cancelButtonText]}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[
                s.button,
                s.confirmButton,
                !value.trim() && s.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!value.trim()}
            >
              <Text
                style={[
                  s.buttonText,
                  s.confirmButtonText,
                  !value.trim() && s.buttonTextDisabled,
                ]}
              >
                {confirmText}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    overlayDismiss: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    modalContent: {
      width: "100%",
      maxWidth: 320,
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: theme.text,
      textAlign: "center",
      marginBottom: 16,
    },
    input: {
      width: "100%",
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: theme.text,
      marginBottom: 20,
      minHeight: 50,
    },
    buttonRow: {
      flexDirection: "row",
      gap: 12,
    },
    button: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    cancelButton: {
      backgroundColor: theme.primary,
    },
    confirmButton: {
      backgroundColor: theme.accent,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: "600",
    },
    cancelButtonText: {
      color: theme.text,
    },
    confirmButtonText: {
      color: "#fff",
    },
    buttonTextDisabled: {
      opacity: 0.5,
    },
  });
}
