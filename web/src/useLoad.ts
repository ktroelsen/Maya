import { useEffect, useState } from 'react';
import { errorMessage } from './api';

/** Loads data for a page; returns [data, error]. Reloads when the key changes. */
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key });
  useEffect(() => {
    let live = true;
    setState({ key });
    load()
      .then((data) => live && setState({ key, data }))
      .catch((err) => live && setState({ key, error: errorMessage(err, 'Kunne ikke hente indholdet. Er du på nettet?') }));
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state.key === key ? ([state.data, state.error] as const) : ([undefined, undefined] as const);
}
