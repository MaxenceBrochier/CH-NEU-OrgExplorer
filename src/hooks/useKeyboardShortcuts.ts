import { useEffect } from 'react';

/** Ctrl/Cmd + K : ouvre ou ferme la palette de commandes. */
export function useKeyboardShortcuts(togglePalette: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePalette]);
}
