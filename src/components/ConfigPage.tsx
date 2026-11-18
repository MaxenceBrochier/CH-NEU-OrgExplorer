import { useEffect, useState } from 'react';
import { CATEGORY_META, CATEGORY_PRIORITY, DEFAULT_RULES } from '../lib/categories';
import type { CategoryExclusions, CategoryId, CategoryRules } from '../lib/categories';
import type { Employee } from '../types';
import { CategoryExclusionsSection } from './CategoryExclusions';

interface ConfigPageProps {
  rules: CategoryRules;
  counts: Map<CategoryId, number>;
  employees: Employee[];
  matched: Map<string, CategoryId[]>;
  exclusions: CategoryExclusions;
  saving: boolean;
  onChange: (rules: CategoryRules) => void;
  onToggleExclusion: (personKey: string, category: CategoryId) => void;
}

const EDITABLE: Array<{ id: keyof CategoryRules; help: string }> = [
  { id: 'contractor', help: 'Cherché dans le nom et le poste (ex. le marqueur [C]).' },
  { id: 'siteLead', help: 'Cherché dans le job title et le management level.' },
  { id: 'manager', help: 'Cherché dans le job title et le management level, l’emporte sur team lead.' },
  { id: 'teamLead', help: 'Appliqué seulement si aucun mot-clé manager ne correspond.' },
  { id: 'apprentice', help: 'Cherché dans le job title et le management level.' },
];

export function ConfigPage({
  rules,
  counts,
  employees,
  matched,
  exclusions,
  saving,
  onChange,
  onToggleExclusion,
}: ConfigPageProps) {
  // Le texte brut est conservé pendant la saisie, sinon un retour à la ligne serait supprimé aussitôt.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setDrafts({});
  }, [rules]);

  const textOf = (id: keyof CategoryRules) => drafts[id] ?? rules[id].join('\n');

  const update = (id: keyof CategoryRules, raw: string) => {
    setDrafts((previous) => ({ ...previous, [id]: raw }));
  };

  const commit = (id: keyof CategoryRules) => {
    const raw = drafts[id];
    if (raw === undefined) return;
    const patterns = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    onChange({ ...rules, [id]: patterns });
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Configuration des catégories</h2>
        <p className="mt-1 text-sm text-slate-500">
          Chaque personne est classée par le premier critère qui correspond, dans l'ordre ci-dessous.
          Les mots-clés sont insensibles à la casse et aux accents, un par ligne. Les réglages
          sont enregistrés automatiquement et partagés avec tous les utilisateurs.
          {saving && <span className="ml-2 text-indigo-500">Enregistrement…</span>}
        </p>
      </div>

      <ol className="mb-8 flex flex-wrap gap-2">
        {CATEGORY_PRIORITY.map((id, index) => (
          <li
            key={id}
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${CATEGORY_META[id].chip}`}
          >
            <span className="opacity-60">{index + 1}</span>
            {CATEGORY_META[id].label}
            <span className="opacity-60">{counts.get(id) ?? 0}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-4">
        {EDITABLE.map(({ id, help }) => (
          <section key={id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className={`size-3 rounded-full ${CATEGORY_META[id].bar}`} />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-900">{CATEGORY_META[id].label}</h3>
                <p className="text-xs text-slate-500">{help}</p>
              </div>
              <span className="text-xs text-slate-400">{CATEGORY_META[id].color}</span>
              <button
                type="button"
                onClick={() => onChange({ ...rules, [id]: DEFAULT_RULES[id] })}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs transition hover:bg-slate-100"
              >
                Défaut
              </button>
            </div>
            <textarea
              value={textOf(id)}
              onChange={(event) => update(id, event.target.value)}
              onBlur={() => commit(id)}
              rows={Math.max(3, textOf(id).split('\n').length + 1)}
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Un mot-clé par ligne — pris en compte en quittant le champ.
            </p>
          </section>
        ))}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <span className={`size-3 rounded-full ${CATEGORY_META.global.bar}`} />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-900">Fonctions globales</h3>
              <p className="text-xs text-slate-500">
                Déterminé automatiquement : personnes dont le manager ne correspond à aucun people
                leader présent sur le site. Le rattachement manuel se fait sur la page Dotted lines.
              </p>
            </div>
            <span className="text-xs text-slate-400">{CATEGORY_META.global.color}</span>
          </div>
        </section>
      </div>

      <button
        type="button"
        onClick={() => onChange(DEFAULT_RULES)}
        className="mt-6 rounded-lg border border-slate-200 px-3 py-1.5 text-sm transition hover:bg-slate-100"
      >
        Tout réinitialiser
      </button>

      <CategoryExclusionsSection
        employees={employees}
        matched={matched}
        exclusions={exclusions}
        onToggle={onToggleExclusion}
      />
    </div>
  );
}
