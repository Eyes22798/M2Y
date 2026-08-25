import { Redirect, useRouter } from 'expo-router';

import { useIdentityRouteGuard } from '@/features/identity/routing';
import { CreateIdentityScreen } from '@/features/identity/screens/CreateIdentityScreen';
import { useIdentityRelationship } from '@/stores/identity/IdentityRelationshipProvider';

/**
 * The guard is what makes the primary button lead anywhere. `createIdentity` moves the state to
 * `registering` and the controller then refuses to run again, so without a redirect driven by the
 * state this screen kept showing a control that had silently become a no-op — real keys generated,
 * registration packet queued, and no way forward except the skip button or a process restart.
 */
export default function CreateIdentityRoute() {
  const router = useRouter();
  const { access } = useIdentityRelationship();
  const nextRoute = useIdentityRouteGuard('/create-identity');
  const canUseWorkspaceWithoutIdentity =
    access.kind === 'granted' && access.reason === 'pairing-transport-unavailable';

  if (nextRoute) {
    return <Redirect href={nextRoute} />;
  }

  return (
    <CreateIdentityScreen
      onSkip={canUseWorkspaceWithoutIdentity ? () => router.replace('/chat') : undefined}
    />
  );
}
