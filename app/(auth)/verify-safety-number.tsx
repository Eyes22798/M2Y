import { Redirect } from 'expo-router';

import { useIdentityRouteGuard } from '@/features/identity/routing';
import { AuthPlaceholderScreen } from '@/features/identity/screens/AuthPlaceholderScreen';

/**
 * Still a placeholder until section F builds the real safety-number comparison, but it takes the guard
 * now: both sides must confirm, so this screen is left by the peer's decision arriving in the state
 * rather than by anything the local user touches.
 */
export default function VerifySafetyNumberRoute() {
  const nextRoute = useIdentityRouteGuard('/verify-safety-number');

  if (nextRoute) {
    return <Redirect href={nextRoute} />;
  }

  return (
    <AuthPlaceholderScreen
      step="03"
      title="确认安全号码"
      description="双方线下核对后，才能确认这段私密连接未被替换。"
    />
  );
}
