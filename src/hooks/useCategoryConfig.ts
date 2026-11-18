import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_CONFIG, loadConfig, saveConfig } from '../lib/configSource';
import type { AppConfig } from '../lib/configSource';
import type { CategoryExclusions, CategoryId, CategoryRules } from '../lib/categories';

export type ConfigStatus = 'loading' | 'ready' | 'saving' | 'error';

const SAVE_DELAY_MS = 1000;

/** Configuration partagée des catégories, lue au démarrage et enregistrée dans Dataverse à chaque modification. */
export function useCategoryConfig() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<ConfigStatus>('loading');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const dirtyRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    loadConfig()
      .then((remote) => {
        if (cancelled) return;
        // Une modification faite avant la fin du chargement prime sur la valeur distante.
        if (remote && !dirtyRef.current) setConfig(remote);
        setLoaded(true);
        setStatus('ready');
      })
      .catch((cause) => {
        if (cancelled) return;
        console.error('Erreur chargement configuration:', cause);
        setError(cause instanceof Error ? cause.message : 'Lecture de la configuration impossible.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pas d'enregistrement tant que la lecture n'a pas réussi : on n'écrase pas une configuration existante.
  useEffect(() => {
    if (!loaded || !dirtyRef.current) return;
    const timer = setTimeout(() => {
      dirtyRef.current = false;
      setStatus('saving');
      saveChainRef.current = saveChainRef.current
        .then(() => saveConfig(config))
        .then(() => {
          setError('');
          setStatus('ready');
        })
        .catch((cause) => {
          console.error('Erreur sauvegarde configuration:', cause);
          dirtyRef.current = true;
          setError(cause instanceof Error ? cause.message : 'Enregistrement de la configuration impossible.');
          setStatus('error');
        });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [config, loaded]);

  const update = useCallback((change: (previous: AppConfig) => AppConfig) => {
    dirtyRef.current = true;
    setConfig(change);
  }, []);

  const setRules = useCallback(
    (rules: CategoryRules) => update((previous) => ({ ...previous, rules })),
    [update],
  );

  const toggleExclusion = useCallback(
    (personKey: string, category: CategoryId) =>
      update((previous) => {
        const current = previous.exclusions[personKey] ?? [];
        const next = current.includes(category)
          ? current.filter((id) => id !== category)
          : [...current, category];
        const exclusions: CategoryExclusions = { ...previous.exclusions };
        if (next.length > 0) exclusions[personKey] = next;
        else delete exclusions[personKey];
        return { ...previous, exclusions };
      }),
    [update],
  );

  return {
    rules: config.rules,
    exclusions: config.exclusions,
    status,
    error,
    setRules,
    toggleExclusion,
  };
}
