import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe } from './api';

export interface Async<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Load data for a screen and keep it fresh. `live` names tables whose Realtime changes trigger a
 * quiet reload (no skeleton flash). A newer load always wins over an older one still in flight.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[], live: string[] = []): Async<T> {
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });
  const seq = useRef(0);
  const loader = useRef(load);
  loader.current = load;

  const run = useCallback((quiet: boolean) => {
    const n = ++seq.current;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    loader
      .current()
      .then((data) => n === seq.current && setState({ data, error: null, loading: false }))
      .catch((error) => n === seq.current && setState((s) => ({ data: quiet ? s.data : undefined, error, loading: false })));
  }, []);

  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const liveKey = live.join(',');
  useEffect(() => {
    if (!liveKey) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = subscribe(liveKey, liveKey.split(','), () => {
      clearTimeout(timer);
      timer = setTimeout(() => run(true), 250);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [liveKey, run]);

  return { ...state, reload: useCallback(() => run(true), [run]) };
}

/** Run one action at a time with a busy flag and an error message slot. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clear: () => setError(null) };
}
