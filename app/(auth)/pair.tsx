import { useRouter } from 'expo-router';

import { PairingStatusScreen } from '@/features/identity/screens/PairingStatusScreen';
import { useIdentityRelationship } from '@/stores/identity/IdentityRelationshipProvider';

export default function PairRoute() {
  const router = useRouter();
  const { access } = useIdentityRelationship();
  const workspaceReachable = access.kind === 'granted';

  return (
    <PairingStatusScreen
      onEnterWorkspace={workspaceReachable ? () => router.replace('/chat') : undefined}
    />
  );
}
