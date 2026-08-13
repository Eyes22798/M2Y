import type { PropsWithChildren } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { motion } from '@/design/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type MotionPressableProps = PropsWithChildren<{
  accessibilityLabel: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function MotionPressable({
  accessibilityLabel,
  children,
  onPress,
  style,
  testID,
}: MotionPressableProps) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const setPressed = (pressed: boolean) => {
    const nextScale = reduceMotion || !pressed ? 1 : motion.distance.pressScale;
    scale.set(withSpring(nextScale, motion.spring.expressive));
  };

  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[style, animatedStyle]}
      testID={testID}
    >
      {children}
    </AnimatedPressable>
  );
}
