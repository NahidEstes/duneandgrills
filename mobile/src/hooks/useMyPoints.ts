import { useMemo } from 'react';
import { useApp } from '../state/AppProvider';
import { useResource } from './useResource';
import { readPointsAccount } from '../domain/points';
export function useMyPoints() {
  const app = useApp(); const token = app.session?.token;
  const scope = useMemo(() => ({ actor: app.actor, token }), [app.actor, token]);
  const authenticated = !!app.session && app.session.user._id === app.actor;
  const resource = useResource(async signal => {
    if (!authenticated) return null;
    return readPointsAccount((await app.request<{ data: unknown }>('/rewards/me', { signal })).data);
  }, scope); // No poll callback: focus/foreground/manual refresh only.
  // A protected read can expire while /auth/me is completing its own validation.
  // Never retain points or leave the screen without a sign-in action on 401.
  const authorized = authenticated && resource.errorStatus !== 401;
  return { ...resource, data: authorized ? resource.data : null, authenticated: authorized };
}
