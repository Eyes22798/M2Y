import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { motion, resolveMotionDuration } from '@/design/tokens';

type MotionRevealProps = PropsWithChildren<{
  delay?: number;
  style?: StyleProp<ViewStyle>;
}>;

export function MotionReveal({ children, delay = 0, style }: MotionRevealProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    progress.set(
      withTiming(1, {
        duration: resolveMotionDuration(motion.duration.slow + delay, reduceMotion),
      }),
    );
  }, [delay, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * motion.distance.enter }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
