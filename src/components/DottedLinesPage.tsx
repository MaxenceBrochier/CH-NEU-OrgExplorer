import { useMemo, useState } from 'react';
import { personId } from '../lib/buildTree';
import { NO_DOTTED_LINE } from '../types';
import type { DottedLinks, Employee } from '../types';

interface DottedLinesPageProps {
  employees: Employee[];
  unmanaged: Employee[];
  links: DottedLinks;
  onChange: (links: DottedLinks) => void;
}

export function DottedLinesPage({ employees, unmanaged, links, onChange }: DottedLinesPageProps) {
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);

  const options = useMemo(
    () =>
      [...employees]
        .sort((a, b) => a.worker.localeCompare(b.worker))
        .map((employee) => ({
          id: personId(employee),
          label: employee.jobTitle ? `${employee.worker} — ${employee.jobTitle}` : employee.worker,
        })),
    [employees],
  );

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return unmanaged.filter((employee) => {
      if (onlyMissing && links[personId(employee)]) return false;
      if (!term) return true;
      return [employee.worker, employee.jobTitle, employee.department, employee.service]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [unmanaged, links, query, onlyMissing]);

  const assign = (employee: Employee, value: string) => {
    const next = { ...links };
    if (value) next[personId(employee)] = value;
    else delete next[personId(employee)];
    onChange(next);
  };

  const assigned = unmanaged.filter((employee) => links[personId(employee)]).length;

  if (unmanaged.length === 0) {
    return (
      <div className="p-16 text-center text-sm text-slate-500">
        Toutes les personnes ont un manager direct : aucun rattachement manuel nécessaire.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Dotted lines</h2>
        <p className="mt-1 text-sm text-slate-500">
          Rattachez manuellement les personnes sans manager direct. Choisissez « {NO_DOTTED_LINE} »
          si la personne n'a pas de dotted line sur le site. Les choix sont conservés pour la
          session en cours.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrer les personnes…"
          className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(event) => setOnlyMissing(event.target.checked)}
            className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          À traiter uniquement
        </label>
        <span className="ml-auto text-xs text-slate-500">
          {assigned} / {unmanaged.length} renseignés
        </span>
        <button
          type="button"
          onClick={() => onChange({})}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm transition hover:bg-slate-100"
        >
          Tout réinitialiser
        </button>
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {rows.map((employee) => {
          const id = personId(employee);
          const value = links[id] ?? '';
          return (
            <li key={employee.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{employee.worker}</p>
                <p className="truncate text-xs text-slate-500">
                  {[employee.jobTitle, employee.department, employee.service]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
              </div>
              <select
                value={value}
                onChange={(event) => assign(employee, event.target.value)}
                className={`w-72 rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:outline-none ${
                  value ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50'
                }`}
              >
                <option value="">À définir…</option>
                <option value={NO_DOTTED_LINE}>{NO_DOTTED_LINE} — pas de dotted line</option>
                {options
                  .filter((option) => option.id !== id)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-500">Aucun résultat.</li>
        )}
      </ul>
    </div>
  );
}
