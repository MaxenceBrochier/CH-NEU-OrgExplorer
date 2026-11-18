import { useEffect, useState } from 'react';

/** État conservé dans le sessionStorage : perdu à la fermeture de l'onglet, gardé au rechargement. */
export function useSessionState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // stockage indisponible ou plein : l'app continue sans persistance
    }
  }, [key, value]);

  return [value, setValue] as const;
}
