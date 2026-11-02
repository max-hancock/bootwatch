import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { fontSize, spacing, borderRadius, shadowCard, type AppColors, fonts } from '../theme';

const BOOTWATCH_MONO = require('../../assets/android-icon-monochrome.png');

type AuthMode = 'signIn' | 'signUp' | 'forgotPassword';

export default function AuthScreen() {
  const { colors } = useTheme();
  const { signIn, signUp, resetPasswordForEmail, signInWithGoogle, signInWithApple } = useAuth();
  const styles = createStyles(colors);
  const [authMode, setAuthMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    if (authMode === 'signUp' && !displayName.trim()) {
      setError('Display name is required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    if (authMode === 'signUp') {
      const { error } = await signUp(email.trim(), password, displayName.trim());
      if (error) setError(error);
    } else {
      const { error } = await signIn(email.trim(), password);
      if (error) setError(error);
    }
    setLoading(false);
  }

  async function handleForgotSubmit() {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }
    setLoading(true);
    const { error } = await resetPasswordForEmail(email.trim());
    setLoading(false);
    if (error) setError(error);
    else setForgotSent(true);
  }

  async function handleGoogle() {
    setError(null);
    setOauthLoading('google');
    const { error } = await signInWithGoogle();
    if (error) setError(error);
    setOauthLoading(null);
  }

  async function handleApple() {
    setError(null);
    setOauthLoading('apple');
    const { error } = await signInWithApple();
    if (error) setError(error);
    setOauthLoading(null);
  }

  const anyLoading = loading || oauthLoading !== null;

  /** Hide OAuth only after forgot-password email was sent — show it on forgot screen so Google/Apple users aren’t stranded */
  const showOAuthSection = !(authMode === 'forgotPassword' && forgotSent);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Image source={BOOTWATCH_MONO} style={[styles.brandMark, { tintColor: colors.accent }]} resizeMode="contain" />
        <View style={styles.titleRow}>
          <Text style={styles.title}>BootWatch</Text>
          <Text style={styles.titleTm}>™</Text>
        </View>
        <Text style={styles.subtitle}>
          {authMode === 'forgotPassword'
            ? forgotSent
              ? 'If an account uses email & password, we sent a reset link.'
              : 'Get back into your account'
            : authMode === 'signUp'
              ? 'Create an account to report sightings'
              : 'Sign in to your account'}
        </Text>

        {showOAuthSection && (
          <>
            {authMode === 'forgotPassword' && !forgotSent && (
              <View style={[styles.callout, { backgroundColor: colors.infoTint, borderColor: colors.primary }]}>
                <Ionicons name="information-circle-outline" size={22} color={colors.primary} style={styles.calloutIcon} />
                <Text style={[styles.calloutText, { color: colors.text }]}>
                  If you created BootWatch with Google or Apple, sign in with the same provider using the buttons below.
                  Password reset email only applies to accounts that signed up with email and password.
                </Text>
              </View>
            )}

        <Pressable
          style={styles.oauthButton}
          onPress={handleGoogle}
          disabled={anyLoading}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          accessibilityState={{ disabled: anyLoading, busy: oauthLoading === 'google' }}
        >
          {oauthLoading === 'google' ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color={colors.text} />
              <Text style={styles.oauthButtonText}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        {Platform.OS === 'ios' && (
          <Pressable
            style={[styles.oauthButton, styles.appleButton]}
            onPress={handleApple}
            disabled={anyLoading}
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
            accessibilityState={{ disabled: anyLoading, busy: oauthLoading === 'apple' }}
          >
            {oauthLoading === 'apple' ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                <Text style={[styles.oauthButtonText, styles.appleButtonText]}>Continue with Apple</Text>
              </>
            )}
          </Pressable>
        )}

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>
            {authMode === 'forgotPassword' && !forgotSent ? 'Email + password accounts' : 'or'}
          </Text>
          <View style={styles.dividerLine} />
        </View>
          </>
        )}

        {/* Email/password form */}
        {authMode === 'signUp' && (
          <TextInput
            style={styles.input}
            placeholder="Display name"
            placeholderTextColor={colors.textSecondary}
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={authMode !== 'forgotPassword' || !forgotSent}
        />

        {authMode !== 'forgotPassword' && (
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        )}

        {authMode === 'signIn' && (
          <Pressable
            style={styles.forgotLinkWrap}
            accessibilityRole="link"
            onPress={() => {
              setAuthMode('forgotPassword');
              setError(null);
              setForgotSent(false);
            }}
          >
            <Text style={styles.forgotLinkText}>Forgot password?</Text>
          </Pressable>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={styles.primaryButton}
          onPress={authMode === 'forgotPassword' ? handleForgotSubmit : handleSubmit}
          disabled={anyLoading || (authMode === 'forgotPassword' && forgotSent)}
          accessibilityRole="button"
          accessibilityLabel={authMode === 'forgotPassword' ? 'Send reset link' : authMode === 'signUp' ? 'Create Account' : 'Sign In'}
          accessibilityState={{ disabled: anyLoading || (authMode === 'forgotPassword' && forgotSent), busy: loading }}
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {authMode === 'forgotPassword' ? 'Send reset link' : authMode === 'signUp' ? 'Create Account' : 'Sign In'}
            </Text>
          )}
        </Pressable>

        {authMode === 'forgotPassword' ? (
          <Pressable
            style={styles.linkButton}
            onPress={() => {
              setAuthMode('signIn');
              setError(null);
              setForgotSent(false);
            }}
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>Back to sign in</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.linkButton}
            onPress={() => {
              setAuthMode((m) => (m === 'signUp' ? 'signIn' : 'signUp'));
              setError(null);
            }}
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>
              {authMode === 'signUp' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </Text>
          </Pressable>
        )}
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
      width: 150,
      height: 150,
      marginBottom: -spacing.sm,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    title: {
      fontSize: fontSize.xxl,
      fontFamily: fonts.displayBold,
      color: colors.text,
    },
    titleTm: {
      fontSize: 12,
      fontFamily: fonts.bodyMedium,
      color: colors.textSecondary,
      marginTop: 4,
      marginLeft: 2,
    },
    subtitle: {
      fontSize: fontSize.md,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.sm,
      lineHeight: 22,
    },
    oauthButton: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    oauthButtonText: {
      fontSize: fontSize.md,
      fontFamily: fonts.bodyMedium,
      color: colors.text,
    },
    appleButton: {
      backgroundColor: '#000000',
      borderColor: '#000000',
    },
    appleButtonText: {
      color: '#FFFFFF',
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      gap: spacing.md,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.body,
      color: colors.textSecondary,
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
    linkButton: {
      paddingVertical: spacing.sm,
    },
    linkText: {
      color: colors.primary,
      fontSize: fontSize.sm,
      fontFamily: fonts.bodyMedium,
    },
    forgotLinkWrap: {
      alignSelf: 'flex-end',
      width: '100%',
      alignItems: 'flex-end',
      paddingVertical: 2,
    },
    forgotLinkText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.bodyMedium,
      color: colors.primary,
    },
    callout: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      width: '100%',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
    },
    calloutIcon: {
      marginTop: 1,
    },
    calloutText: {
      flex: 1,
      fontSize: fontSize.sm,
      fontFamily: fonts.body,
      lineHeight: 20,
    },
  });
}
