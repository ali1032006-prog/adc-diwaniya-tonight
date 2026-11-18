import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { getMe, type Profile, type ProfilePrivate } from './api';
import { finishReturn, noteLinkWithoutSession } from './auth';

export type SessionStatus = 'loading' | 'offline' | 'signedOut' | 'needsProfile' | 'ready';

export interface SessionCtx {
  status: SessionStatus;
  userId: string | null;
  email: string | null;
  provider: string | null;
  profile: Profile | null;
  priv: ProfilePrivate | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** True after a password-reset link signed this browser in: the app asks for a new password first. */
  recovery?: boolean;
  endRecovery?: () => void;
}

const noop = async () => {};
export const SessionContext = createContext<SessionCtx>({
  status: 'signedOut',
  userId: null,
  email: null,
  provider: null,
  profile: null,
  priv: null,
  refresh: noop,
  signOut: noop,
});

export function useSession() {
  return useContext(SessionContext);
}

/**
 * Holds the Supabase session and the signed-in person's profile. Google or email + password; getSession
 * waits for the client to swap the one-time ?code= (Google, confirm or reset link), then the address bar is tidied.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const client = supabase();
  const [state, setState] = useState<Omit<SessionCtx, 'refresh' | 'signOut'>>({
    status: client ? 'loading' : 'offline',
    userId: null,
    email: null,
    provider: null,
    profile: null,
    priv: null,
  });
  // One profile load at a time: the first getSession and onAuthStateChange race on open.
  const inflight = useRef<Promise<void> | null>(null);
  // A reset link comes back as ?reset=1&code=... (sendPasswordReset); supabase-js also fires
  // PASSWORD_RECOVERY for it. Either one opens the new-password step.
  const [recovery, setRecovery] = useState(() => new URLSearchParams(window.location.search).get('reset') === '1');

  const load = useCallback(async () => {
    if (!client) return;
    if (inflight.current) return inflight.current;
    inflight.current = (async () => {
      try {
        const hadCode = new URLSearchParams(window.location.search).has('code');
        const { data } = await client.auth.getSession();
        noteLinkWithoutSession(hadCode, Boolean(data.session));
        if (!data.session) setRecovery(false);
        finishReturn();
        const user = data.session?.user;
        if (!user) {
          setState({ status: 'signedOut', userId: null, email: null, provider: null, profile: null, priv: null });
          return;
        }
        const { profile, priv } = await getMe();
        setState({
          status: profile && priv ? 'ready' : 'needsProfile',
          userId: user.id,
          email: user.email ?? null,
          provider: (user.app_metadata?.provider as string | undefined) ?? null,
          profile,
          priv,
        });
      } catch {
        setState((s) => ({ ...s, status: s.userId ? s.status : 'signedOut' }));
      } finally {
        inflight.current = null;
      }
    })();
    return inflight.current;
  }, [client]);

  useEffect(() => {
    if (!client) return;
    void load();
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void load();
    });
    return () => data.subscription.unsubscribe();
  }, [client, load]);

  const signOut = useCallback(async () => {
    if (client) await client.auth.signOut();
    await load();
  }, [client, load]);

  const endRecovery = useCallback(() => setRecovery(false), []);
  const value = useMemo(
    () => ({ ...state, refresh: load, signOut, recovery, endRecovery }),
    [state, load, signOut, recovery, endRecovery],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
