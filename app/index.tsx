import { Redirect } from 'expo-router';

import { useIdentityRelationship } from '@/stores/identity/IdentityRelationshipProvider';

/**
 * Chooses the entry route from the identity state instead of jumping straight into the private
 * workspace. The `(auth)` routes were unreachable at runtime while this redirect was unconditional.
 *
 * The pairing routes are only entered when something can actually be done there: without a reachable
 * pairing service, an identity that exists but cannot be registered would otherwise trap every
 * launch on a status screen. `IdentityRelationshipGate` remains the component that decides whether
 * private content may mount at all — this redirect only picks the first screen.
 */
export default function IndexRoute() {
  const { access, state } = useIdentityRelationship();
  const pairingReachable = !(
    access.kind === 'granted' && access.reason === 'pairing-transport-unavailable'
  );

  switch (state.status) {
    case 'needsIdentity':
    case 'creatingIdentity':
      return <Redirect href="/create-identity" />;
    case 'awaitingSafetyVerification':
      return <Redirect href="/verify-safety-number" />;
    case 'registering':
    case 'unpaired':
    case 'outgoingPending':
    case 'incomingReview':
    case 'rejected':
    case 'cancelled':
    case 'expired':
    case 'networkFailed':
    case 'identityChanged':
      return pairingReachable ? <Redirect href="/pair" /> : <Redirect href="/chat" />;
    default:
      return <Redirect href="/chat" />;
  }
}
