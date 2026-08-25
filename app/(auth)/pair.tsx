import { Redirect, useRouter } from 'expo-router';

import { useIdentityRouteGuard } from '@/features/identity/routing';
import { PairingStatusScreen } from '@/features/identity/screens/PairingStatusScreen';
import { useIdentityRelationship } from '@/stores/identity/IdentityRelationshipProvider';

/**
 * A local reset performed from here drops the identity, so this screen has to leave on its own once
 * the state says there is nothing left to pair. It is also the screen that must move to
 * `/verify-safety-number` when a request is accepted, which nothing was watching for.
 */
export default function PairRoute() {
  const router = useRouter();
  const { access } = useIdentityRelationship();
  const nextRoute = useIdentityRouteGuard('/pair');
  const workspaceReachable = access.kind === 'granted';

  if (nextRoute) {
    return <Redirect href={nextRoute} />;
  }

  return (
    <PairingStatusScreen
      onEnterWorkspace={workspaceReachable ? () => router.replace('/chat') : undefined}
    />
  );
}
