export const motion = {
  duration: {
    fast: 160,
    normal: 260,
    slow: 420,
  },
  spring: {
    gentle: { damping: 22, stiffness: 210, mass: 0.9 },
    expressive: { damping: 17, stiffness: 260, mass: 0.8 },
  },
  distance: {
    enter: 14,
    pressScale: 0.975,
  },
} as const;

export function resolveMotionDuration(duration: number, reduceMotion: boolean, scale = 1): number {
  return reduceMotion ? 0 : duration * scale;
}
