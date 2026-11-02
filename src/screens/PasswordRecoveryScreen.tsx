import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { fontSize, spacing, borderRadius, shadowCard, type AppColors, fonts } from '../theme';

const BOOTWATCH_MONO = require('../../assets/android-icon-monochrome.png');

export default function PasswordRecoveryScreen() {
  const { colors } = useTheme();
  const { completePasswordRecovery, signOut } = useAuth();
  const styles = createStyles(colors);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: err } = await completePasswordRecovery(password);
    if (err) setError(err);
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Image source={BOOTWATCH_MONO} style={[styles.brandMark, { tintColor: colors.accent }]} resizeMode="contain" />
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>Choose a strong password you have not used before on this account.</Text>

        <TextInput
          style={styles.input}
          placeholder="New password"
          placeholderTextColor={colors.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          placeholderTextColor={colors.textSecondary}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={styles.primaryButton}
          onPress={handleSubmit}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Update password"
          accessibilityState={{ disabled: loading, busy: loading }}
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.primaryButtonText}>Update password</Text>
          )}
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => void signOut()} disabled={loading} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>Cancel and sign out</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    card: {
      backgroundColor: colors.background,
      borderRadius: borderRadius.xl,
      padding: spacing.xl,
      alignItems: 'center',
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadowCard,
    },
    brandMark: {
      width: 120,
      height: 120,
      marginBottom: -spacing.sm,
    },
    title: {
      fontSize: fontSize.xxl,
      fontFamily: fonts.displayBold,
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: fontSize.md,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.sm,
      lineHeight: 22,
    },
    input: {
      width: '100%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: fontSize.md,
      fontFamily: fonts.body,
      color: colors.text,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.dangerLight,
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      width: '100%',
    },
    errorText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.body,
      color: colors.danger,
      flex: 1,
    },
    primaryButton: {
      width: '100%',
      backgroundColor: colors.primary,
      paddingVertical: spacing.md + 2,
      borderRadius: borderRadius.lg,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: colors.textInverse,
      fontSize: fontSize.lg,
      fontFamily: fonts.display,
    },
    secondaryButton: {
      paddingVertical: spacing.sm,
    },
    secondaryButtonText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.bodyMedium,
      color: colors.textSecondary,
    },
  });
}
