import { Component, ReactNode } from 'react';
import { Appearance, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { darkColors, lightColors, type AppColors } from '../theme';
import { fontSize, spacing, borderRadius, shadowCard, fonts } from '../theme';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      const isDark = Appearance.getColorScheme() === 'dark';
      const colors: AppColors = isDark ? darkColors : lightColors;
      const styles = createStyles(colors);
      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={56} color={colors.danger} />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            The app ran into an unexpected error. Try restarting or tap below to retry.
          </Text>
          <Pressable style={styles.retryButton} onPress={this.handleRetry} accessibilityRole="button">
            <Ionicons name="refresh" size={20} color={colors.textInverse} />
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
      backgroundColor: colors.background,
      gap: spacing.md,
    },
    title: {
      fontSize: fontSize.xl,
      fontFamily: fonts.displayBold,
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: fontSize.md,
      fontFamily: fonts.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 320,
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.primary,
      paddingVertical: spacing.md + 2,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.lg,
      marginTop: spacing.md,
      ...shadowCard,
    },
    retryText: {
      color: colors.textInverse,
      fontSize: fontSize.lg,
      fontFamily: fonts.display,
    },
  });
}
