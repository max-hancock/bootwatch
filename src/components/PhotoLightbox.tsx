import { useMemo } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontSize, spacing } from '../theme';
import { fonts } from '../theme/fonts';
import { useTheme } from '../context/ThemeContext';

interface Props {
  imageUri: string | null;
  onClose: () => void;
}

export default function PhotoLightbox({ imageUri, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const topPad = useMemo(() => {
    if (insets.top > 0) return insets.top + 4;
    if (Platform.OS === 'ios') return 50;
    return (StatusBar.currentHeight ?? 24) + 4;
  }, [insets.top]);

  const open = imageUri != null && imageUri.length > 0;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      {open && (
        <View style={styles.root}>
          <StatusBar backgroundColor="rgba(0,0,0,0.6)" barStyle="light-content" />
          <Pressable
            style={[StyleSheet.absoluteFill, Platform.OS === 'web' && styles.webBackdrop]}
            onPress={onClose}
            accessibilityLabel="Close photo"
            accessibilityRole="button"
          />
          {/* none, not box-none: the layer holds only the image, and taps need to
              reach the backdrop behind it to close the lightbox. */}
          <View style={styles.imageLayer} pointerEvents="none">
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode="contain"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          </View>
          <View style={[styles.topBar, { paddingTop: topPad }]} pointerEvents="box-none">
            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: colors.textSecondary + '40' },
                pressed && styles.closeButtonPressed,
              ]}
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.hint} pointerEvents="none">
              Tap to close
            </Text>
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.97)',
  },
  webBackdrop: {
    cursor: 'pointer' as const,
  },
  imageLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  closeButtonPressed: {
    opacity: 0.8,
  },
  hint: {
    flex: 1,
    textAlign: 'right',
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.55)',
  },
});
