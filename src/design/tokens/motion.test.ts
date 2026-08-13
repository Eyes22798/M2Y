import { motion, resolveMotionDuration } from './motion';

describe('motion tokens', () => {
  it('turns movement off when the system requests reduced motion', () => {
    expect(resolveMotionDuration(motion.duration.normal, true)).toBe(0);
  });

  it('allows deterministic zero-duration animation in tests', () => {
    expect(resolveMotionDuration(motion.duration.slow, false, 0)).toBe(0);
  });
});
