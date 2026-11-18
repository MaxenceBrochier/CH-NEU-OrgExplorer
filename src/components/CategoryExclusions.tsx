import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { personId } from '../lib/buildTree';
import { CATEGORY_META } from '../lib/categories';
import type { CategoryExclusions, CategoryId } from '../lib/categories';
import { normalize } from '../lib/normalize';
import type { Employee } from '../types';

/** « Interne » est le repli par défaut : il n'y a rien à en exclure. */
const EXCLUDABLE: CategoryId[] = ['siteLead', 'manager', 'teamLead', 'global', 'apprentice', 'contractor'];

const MAX_RESULTS = 8;

interface CategoryExclusionsProps {
  employees: Employee[];
  /** Catégories qui correspondent à chaque personne (clé = employee.key), avant exclusion. */
  matched: Map<string, CategoryId[]>;
  exclusions: CategoryExclusions;
  onToggle: (personKey: string, category: CategoryId) => void;
}

export function CategoryExclusionsSection({
  employees,
  matched,
  exclusions,
  onToggle,
}: CategoryExclusionsProps) {
  const byPersonId = useMemo(() => new Map(employees.map((e) => [personId(e), e])), [employees]);

  return (
    <section className="mt-10">
      <h3 className="text-base font-semibold text-slate-900">Exclusions par catégorie</h3>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        Écarte une personne d’une catégorie alors que son poste y correspond. Elle garde ses autres
        catégories, ou « Interne » s’il ne lui en reste aucune.
      </p>
      <div className="space-y-4">
        {EXCLUDABLE.map((id) => (
          <ExclusionCard
            key={id}
            category={id}
            employees={employees}
            matched={matched}
            byPersonId={byPersonId}
            exclusions={exclusions}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}

interface ExclusionCardProps {
  category: CategoryId;
  employees: Employee[];
  matched: Map<string, CategoryId[]>;
  byPersonId: Map<string, Employee>;
  exclusions: CategoryExclusions;
  onToggle: (personKey: string, category: CategoryId) => void;
}

function ExclusionCard({
  category,
  employees,
  matched,
  byPersonId,
  exclusions,
  onToggle,
}: ExclusionCardProps) {
  const excludedIds = useMemo(
    () => Object.keys(exclusions).filter((pid) => exclusions[pid]?.includes(category)),
    [exclusions, category],
  );

  // Seules les personnes qui correspondent à la catégorie ont un intérêt à en être exclues.
  const candidates = useMemo(() => {
    const excluded = new Set(excludedIds);
    return employees
      .filter((e) => matched.get(e.key)?.includes(category) && !excluded.has(personId(e)))
      .map((e) => ({
        employee: e,
        haystack: normalize([e.worker, e.jobTitle, e.department, e.service, e.email].join(' ')),
      }))
      .sort((a, b) => a.employee.worker.localeCompare(b.employee.worker));
  }, [employees, matched, category, excludedIds]);

  const meta = CATEGORY_META[category];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className={`size-3 rounded-full ${meta.bar}`} />
        <h4 className="flex-1 text-sm font-semibold text-slate-900">{meta.label}</h4>
        <span className="text-xs text-slate-400">
          {excludedIds.length === 0
            ? 'Aucune exclusion'
            : `${excludedIds.length} exclusion${excludedIds.length > 1 ? 's' : ''}`}
        </span>
      </div>

      {excludedIds.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {excludedIds.map((pid) => {
            const person = byPersonId.get(pid);
            return (
              <li
                key={pid}
                className="animate-fade-in flex items-center gap-2 rounded-full bg-slate-100 py-1 pr-1 pl-3 text-xs text-slate-700"
              >
                <span className="font-medium">{person?.worker ?? pid}</span>
                {person?.jobTitle && <span className="text-slate-400">{person.jobTitle}</span>}
                <button
                  type="button"
                  onClick={() => onToggle(pid, category)}
                  aria-label={`Rétablir ${person?.worker ?? pid} dans ${meta.label}`}
                  className="flex size-5 items-center justify-center rounded-full text-sm text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <PersonSearch
        label={`Exclure une personne de ${meta.label}`}
        candidates={candidates}
        onPick={(employee) => onToggle(personId(employee), category)}
      />
    </div>
  );
}

interface PersonSearchProps {
  label: string;
  candidates: Array<{ employee: Employee; haystack: string }>;
  onPick: (employee: Employee) => void;
}

function PersonSearch({ label, candidates, onPick }: PersonSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const found = terms.length
      ? candidates.filter((c) => terms.every((term) => c.haystack.includes(term)))
      : candidates;
    return found.slice(0, MAX_RESULTS);
  }, [candidates, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Garde l'option active visible pendant la navigation au clavier.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (employee: Employee) => {
    onPick(employee);
    setQuery('');
    setActive(0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && results[active]) {
      event.preventDefault();
      pick(results[active].employee);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <circle cx="9" cy="9" r="5.5" />
          <path d="m13.5 13.5 3.5 3.5" />
        </svg>
        <input
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
          value={query}
          placeholder="Rechercher un nom, un poste, un service…"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm text-slate-800 transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          className="animate-fade-in absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5"
        >
          {results.length === 0 && (
            <li className="px-3 py-3 text-center text-sm text-slate-400" role="presentation">
              {candidates.length === 0
                ? 'Personne d’autre ne correspond à cette catégorie.'
                : 'Aucun résultat.'}
            </li>
          )}
          {results.map(({ employee }, index) => (
            <li
              key={employee.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // mouseDown plutôt que click : le blur de l'input fermerait la liste avant le clic.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(employee);
              }}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-baseline gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                index === active ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700'
              }`}
            >
              <span className="truncate font-medium">{employee.worker}</span>
              <span className="truncate text-xs text-slate-400">
                {[employee.jobTitle, employee.service].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
