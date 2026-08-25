import { Redirect } from 'expo-router';

import { useIdentityEntryRoute } from '@/features/identity/routing';

/**
 * Chooses the entry route from the identity state instead of jumping straight into the private
 * workspace. The `(auth)` routes were unreachable at runtime while this redirect was unconditional.
 *
 * The mapping itself lives in `resolveIdentityRoute`, because this route is unmounted the moment it
 * redirects and therefore cannot be the only thing watching the state. Rendering nothing while the
 * decision is still pending is deliberate: `IdentityRelationshipGate` is showing progress over this
 * route anyway, and staying mounted is what lets the first real answer be acted on.
 */
export default function IndexRoute() {
  const route = useIdentityEntryRoute();
  return route ? <Redirect href={route} /> : null;
}
