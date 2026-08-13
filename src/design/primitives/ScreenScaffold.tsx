import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '@/design/tokens';

type ScreenScaffoldProps = PropsWithChildren<{
  eyebrow: string;
  title: string;
  description?: string;
  trailing?: ReactNode;
  scroll?: boolean;
}>;

export function ScreenScaffold({
  children,
  description,
  eyebrow,
  scroll = true,
  title,
  trailing,
}: ScreenScaffoldProps) {
  const content = (
    <View style={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
        {trailing}
      </View>
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: { flexGrow: 1 },
  content: { flex: 1, padding: spacing.xl, gap: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.sm },
  eyebrow: { ...typography.label, color: colors.accent, textTransform: 'uppercase' },
  title: { ...typography.hero, color: colors.ink },
  description: { ...typography.body, color: colors.inkMuted },
});
