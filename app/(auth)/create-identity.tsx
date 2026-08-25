import { useRouter } from 'expo-router';

import { CreateIdentityScreen } from '@/features/identity/screens/CreateIdentityScreen';
import { useIdentityRelationship } from '@/stores/identity/IdentityRelationshipProvider';

export default function CreateIdentityRoute() {
  const router = useRouter();
  const { access } = useIdentityRelationship();
  const canUseWorkspaceWithoutIdentity =
    access.kind === 'granted' && access.reason === 'pairing-transport-unavailable';

  return (
    <CreateIdentityScreen
      onSkip={canUseWorkspaceWithoutIdentity ? () => router.replace('/chat') : undefined}
    />
  );
}
