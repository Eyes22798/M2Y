import { type IdentityRoute, resolveIdentityRoute } from '@/application/identity/routing';
import { useIdentityRelationship } from '@/stores/identity/IdentityRelationshipProvider';

/**
 * The route the app should be showing right now, for the entry route that owns the initial landing.
 *
 * `null` means "not yet" rather than "nowhere": while the native store is still being inspected the
 * entry route must stay mounted and render nothing. Redirecting on a guess is what made the correct
 * landing depend on whether inspection happened to finish before the unlock screen went away — commit
 * to `/chat` too early and the route that was watching the state is gone by the time the answer
 * arrives.
 *
 * A faulted state does resolve to `/chat`, because `IdentityRelationshipGate` is already covering the
 * screen with the fault UI. The route underneath is only revealed if the user acknowledges the fault
 * and continues into local data, and local data is the only thing that still works then.
 */
export function useIdentityEntryRoute(): IdentityRoute | null {
  const { access, state } = useIdentityRelationship();
  const decision = resolveIdentityRoute(state, access);
  switch (decision.kind) {
    case 'route':
      return decision.route;
    case 'faulted':
      return '/chat';
    case 'pending':
      return null;
  }
}

/**
 * The route a mounted screen must hand over to, or `null` to stay where it is.
 *
 * Every screen in the identity flow needs this, not just the entry route, because the state advances
 * while a screen is mounted: `createIdentity` moves `needsIdentity → creatingIdentity → registering`
 * without anyone navigating, and the controller then rejects the button that started it. Without a
 * guard on the screen itself the user is left pressing a control that has become a no-op.
 *
 * Pending and faulted both mean stay: the gate is painting over this screen, and navigating under it
 * would rewrite history the user cannot see — including yanking a local reset out of the auth stack
 * for the moment its re-inspection is in flight.
 */
export function useIdentityRouteGuard(current: IdentityRoute): IdentityRoute | null {
  const { access, state } = useIdentityRelationship();
  const decision = resolveIdentityRoute(state, access);
  if (decision.kind !== 'route' || decision.route === current) {
    return null;
  }
  return decision.route;
}
