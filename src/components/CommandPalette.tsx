import { useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { normalize } from '../lib/normalize';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}

const PERSON_GROUP = 'Personne';

// Plus le score est bas, plus le résultat est pertinent : préfixe du libellé > mot du libellé > contenu > groupe.
function scoreOf(command: Command, term: string): number {
  const label = normalize(command.label);
  if (label.startsWith(term)) return 0;
  if (label.split(/\s+/).some((word) => word.startsWith(term))) return 1;
  if (label.includes(term)) return 2;
  if (normalize(command.group).includes(term)) return 3;
  return -1;
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, containerRef, onClose);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      inputRef.current?.focus();
    }
  }, [open]);

  const results = useMemo(() => {
    const term = normalize(query.trim());
    // Palette vide : uniquement les actions/navigation, pour ne pas noyer la liste sous des centaines de personnes.
    if (!term) return commands.filter((command) => command.group !== PERSON_GROUP).slice(0, 40);

    return commands
      .map((command) => ({ command, score: scoreOf(command, term) }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => a.score - b.score || a.command.label.localeCompare(b.command.label))
      .slice(0, 40)
      .map(({ command }) => command);
  }, [commands, query]);

  // L'entrée active suit le clavier même quand la liste défile.
  useEffect(() => {
    document.getElementById(`cmd-${results[active]?.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  if (!open) return null;

  const runAt = (index: number) => {
    const command = results[index];
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 p-6 pt-[12vh] backdrop-blur-sm print:hidden"
      role="presentation"
      aria-hidden="false"
      onMouseDown={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 animate-in fade-in zoom-in-95 duration-200"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((index) => Math.min(results.length - 1, index + 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(0, index - 1));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              runAt(active);
            }
          }}
          placeholder="Rechercher une action ou une personne…"
          className="w-full border-b border-slate-100 px-5 py-4 text-sm outline-none placeholder:text-slate-400"
        />
        <ul id="command-palette-list" role="listbox" className="max-h-80 overflow-y-auto py-2">
          {results.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                id={`cmd-${command.id}`}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => runAt(index)}
                className={`flex w-full items-center gap-3 px-5 py-2 text-left text-sm ${
                  index === active ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700'
                }`}
              >
                <span className="w-24 shrink-0 text-[11px] tracking-wide text-slate-400 uppercase">
                  {command.group}
                </span>
                <span className="min-w-0 flex-1 truncate">{command.label}</span>
                {command.hint && (
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500">
                    {command.hint}
                  </kbd>
                )}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-5 py-6 text-center text-sm text-slate-500">Aucune commande.</li>
          )}
          {!query.trim() && (
            <li className="px-5 pt-2 pb-1 text-center text-xs text-slate-400">
              Tapez un nom pour retrouver une personne dans l’organigramme.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
