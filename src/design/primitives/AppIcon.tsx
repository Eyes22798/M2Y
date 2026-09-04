import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import {
  Platform,
  StyleSheet,
  Text,
  type ColorValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

const iconNames = {
  add: { ios: 'plus', android: 'add' },
  back: { ios: 'chevron.left', android: 'arrow_back' },
  bookmark: { ios: 'bookmark.fill', android: 'bookmark' },
  chat: { ios: 'bubble.left.fill', android: 'chat_bubble' },
  check: { ios: 'checkmark', android: 'check' },
  checkCircle: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  close: { ios: 'xmark', android: 'close' },
  delete: { ios: 'trash.fill', android: 'delete' },
  handshake: { ios: 'person.2.fill', android: 'handshake' },
  lock: { ios: 'lock.fill', android: 'lock' },
  keyboard: { ios: 'keyboard', android: 'keyboard' },
  more: { ios: 'ellipsis', android: 'more_horiz' },
  note: { ios: 'doc.text.fill', android: 'description' },
  search: { ios: 'magnifyingglass', android: 'search' },
  send: { ios: 'arrow.up', android: 'arrow_upward' },
  settings: { ios: 'gearshape.fill', android: 'settings' },
  qrCode: { ios: 'qrcode.viewfinder', android: 'qr_code_scanner' },
  space: { ios: 'square.grid.2x2.fill', android: 'dashboard' },
  task: { ios: 'checkmark.square.fill', android: 'task_alt' },
  waiting: { ios: 'clock.fill', android: 'schedule' },
} satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type AppIconName = keyof typeof iconNames;

const webGlyphs = {
  add: '+',
  back: '‹',
  bookmark: '◆',
  chat: '●',
  check: '✓',
  checkCircle: '✓',
  chevronRight: '›',
  close: '×',
  delete: '×',
  handshake: '◇',
  lock: '●',
  keyboard: '⌨',
  more: '•••',
  note: '≡',
  search: '⌕',
  send: '↑',
  settings: '⚙',
  qrCode: '▣',
  space: '▦',
  task: '✓',
  waiting: '◷',
} satisfies Record<AppIconName, string>;

export function AppIcon({
  color,
  name,
  size = 22,
  style,
}: {
  color: ColorValue;
  name: AppIconName;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  if (Platform.OS === 'web') {
    return (
      <Text
        aria-hidden
        style={[
          styles.webIcon,
          { color, fontSize: size, height: size, lineHeight: size },
          style as StyleProp<TextStyle>,
        ]}
      >
        {webGlyphs[name]}
      </Text>
    );
  }

  return (
    <SymbolView
      name={iconNames[name]}
      resizeMode="scaleAspectFit"
      size={size}
      style={[{ width: size, height: size }, style]}
      tintColor={color}
      type="monochrome"
    />
  );
}

const styles = StyleSheet.create({
  webIcon: { fontWeight: '700', textAlign: 'center' },
});
