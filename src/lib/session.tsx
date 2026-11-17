import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { getMe, type Profile, type ProfilePrivate } from './api';
import { finishReturn } from './auth';

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
 * Holds the Supabase session and the signed-in person's profile. Sign-in is Google only (ruling A);
 * getSession waits for the client to swap Google's one-time code, then the address bar is tidied.
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

  const load = useCallback(async () => {
    if (!client) return;
    if (inflight.current) return inflight.current;
    inflight.current = (async () => {
      try {
        const { data } = await client.auth.getSession();
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
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void load();
    });
    return () => data.subscription.unsubscribe();
  }, [client, load]);

  const signOut = useCallback(async () => {
    if (client) await client.auth.signOut();
    await load();
  }, [client, load]);

  const value = useMemo(() => ({ ...state, refresh: load, signOut }), [state, load, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
