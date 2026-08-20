import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '@/design/primitives/AppIcon';
import { colors, radius, spacing, typography } from '@/design/tokens';

const futureSections = [
  {
    description: '创建本机身份、恢复短语与身份重置',
    icon: 'lock',
    title: '身份与恢复',
  },
  {
    description: '配对另一端并核验安全号',
    icon: 'handshake',
    title: '关系与安全号',
  },
  {
    description: '管理登录设备与撤销访问',
    icon: 'settings',
    title: '设备管理',
  },
] satisfies { description: string; icon: AppIconName; title: string }[];

export function SettingsScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>设置</Text>
          <Text style={styles.subtitle}>管理本机数据，并了解后续会加入的安全能力。</Text>
        </View>

        <View style={styles.previewCard}>
          <View style={styles.previewIcon}>
            <AppIcon color={colors.accent} name="checkCircle" size={26} />
          </View>
          <View style={styles.previewCopy}>
            <Text style={styles.previewTitle}>本地安全空间</Text>
            <Text style={styles.previewDetail}>Chat 和 Space 已保存在当前 Android 设备</Text>
          </View>
          <View style={styles.localBadge}>
            <Text style={styles.localBadgeText}>已加密</Text>
          </View>
        </View>

        <View style={styles.notice}>
          <AppIcon color={colors.inkMuted} name="lock" size={18} />
          <Text style={styles.noticeText}>
            数据库由 SQLCipher
            加密，密钥保存在系统保护存储中。当前仍没有账号、设备配对、服务端同步或端到端加密关系。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>后续安全能力</Text>
          <View style={styles.card}>
            {futureSections.map((item, index) => (
              <View key={item.title} style={[styles.row, index > 0 && styles.rowBorder]}>
                <View style={styles.rowIcon}>
                  <AppIcon color={colors.inkMuted} name={item.icon} size={20} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowDetail}>{item.description}</Text>
                </View>
                <Text style={styles.futureLabel}>尚未实现</Text>
              </View>
            ))}
          </View>
        </View>

        {__DEV__ ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>开发工具</Text>
            <Link href="/_dev/flash-list" style={styles.devLink}>
              打开 10,000 条消息基准页
            </Link>
            <Link href="/_dev/storage" style={styles.devLink}>
              运行 Android 加密存储验收
            </Link>
            <Link href="/_dev/e2ee" style={styles.devLink}>
              运行 Android E2EE 原生加载门禁
            </Link>
          </View>
        ) : null}

        <Text style={styles.version}>M2Y 0.1.0 · Expo SDK 56 · Android 本地安全基础</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  content: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.section },
  header: { gap: spacing.xs },
  title: { ...typography.hero, color: colors.ink },
  subtitle: { ...typography.body, color: colors.inkMuted },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
  previewIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  previewCopy: { flex: 1, gap: spacing.xs },
  previewTitle: { ...typography.title, color: colors.ink },
  previewDetail: { ...typography.caption, color: colors.inkMuted },
  localBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.positiveSoft,
  },
  localBadgeText: { ...typography.caption, color: colors.positive },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  noticeText: { ...typography.caption, flex: 1, color: colors.inkMuted },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.label, color: colors.inkMuted },
  card: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  rowIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  rowCopy: { flex: 1, gap: spacing.xs },
  rowTitle: { ...typography.title, color: colors.ink },
  rowDetail: { ...typography.caption, color: colors.inkMuted },
  futureLabel: { ...typography.caption, color: colors.inkFaint },
  devLink: {
    ...typography.title,
    padding: spacing.lg,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  version: { ...typography.caption, color: colors.inkFaint, textAlign: 'center' },
});
