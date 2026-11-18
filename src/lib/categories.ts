import type { Employee } from '../types';
import { personId } from './buildTree';

export type CategoryId =
  | 'contractor'
  | 'global'
  | 'siteLead'
  | 'manager'
  | 'teamLead'
  | 'apprentice'
  | 'internal';

export interface CategoryRules {
  contractor: string[];
  siteLead: string[];
  manager: string[];
  teamLead: string[];
  apprentice: string[];
}

/** Catégories écartées à la main pour une personne, indexées par personId. */
export type CategoryExclusions = Record<string, CategoryId[]>;

/** Ordre d'évaluation : la catégorie la plus spécifique donne la couleur de la carte. */
export const CATEGORY_PRIORITY: CategoryId[] = [
  'global',
  'siteLead',
  'manager',
  'teamLead',
  'internal',
  'apprentice',
  'contractor',
];

export const CATEGORY_META: Record<
  CategoryId,
  { label: string; color: string; bar: string; chip: string }
> = {
  contractor: {
    label: 'Externe [C]',
    color: '#2d9bf0',
    bar: 'bg-[#2d9bf0]',
    chip: 'bg-[#2d9bf0]/10 text-[#2d9bf0] ring-[#2d9bf0]/40',
  },
  internal: {
    label: 'Interne',
    color: '#9613ad',
    bar: 'bg-[#9613ad]',
    chip: 'bg-[#9613ad]/10 text-[#9613ad] ring-[#9613ad]/40',
  },
  siteLead: {
    label: 'Site Lead Member',
    color: '#fac610',
    bar: 'bg-[#fac610]',
    chip: 'bg-[#fac610]/15 text-[#8a6d00] ring-[#fac610]/50',
  },
  manager: {
    label: 'Manager',
    color: '#f24726',
    bar: 'bg-[#f24726]',
    chip: 'bg-[#f24726]/10 text-[#f24726] ring-[#f24726]/40',
  },
  teamLead: {
    label: 'Team lead',
    color: '#f2994a',
    bar: 'bg-[#f2994a]',
    chip: 'bg-[#f2994a]/15 text-[#b26a1f] ring-[#f2994a]/50',
  },
  global: {
    label: 'Fonction globale',
    color: '#0ca688',
    bar: 'bg-[#0ca688]',
    chip: 'bg-[#0ca688]/10 text-[#0ca688] ring-[#0ca688]/40',
  },
  apprentice: {
    label: 'Apprenti',
    color: '#a2a5ad',
    bar: 'bg-[#a2a5ad]',
    chip: 'bg-[#a2a5ad]/15 text-[#5c5f68] ring-[#a2a5ad]/50',
  },
};

/** Ordre d'affichage : manager, team leader, employé, apprenti, externe. */
export const CATEGORY_SORT: Record<CategoryId, number> = {
  siteLead: 0,
  manager: 1,
  teamLead: 2,
  internal: 3,
  global: 3,
  apprentice: 4,
  contractor: 5,
};

export const DEFAULT_RULES: CategoryRules = {
  contractor: ['[c]', 'contractor', 'external', 'externe', 'prestataire'],
  // NOTE: plusieurs mots-clés siteLead sont spécifiques au site de Neuchâtel
  // (« site head quality neuchatel », « dd&t site head », « manufacturing sciences head »…).
  // Ils restent modifiables dans la page Configuration pour adapter l'app à un autre site.
  siteLead: [
    'site lead',
    'site leader',
    'site manager',
    'site head',
    'head of site',
    'head of',
    'site director',
    'directeur de site',
    'plant manager',
    'leadership team',
    'head of supply chain',
    'head of engineering',
    'head of business excellence',
    'hr site lead',
    'site head quality neuchatel',
    'manufacturing sciences head',
    'dd&t site head',
    'head of finance',
  ],
  manager: ['manager', 'responsable', 'chef de service', 'chef de département', 'lead of'],
  teamLead: [
    'team lead',
    'teamlead',
    'team leader',
    'supervisor',
    'superviseur',
    "chef d'equipe",
    'coordinator',
    'coordinateur',
  ],
  apprentice: [
    'apprenti',
    'apprentice',
    'alternant',
    'alternance',
    'stagiaire',
    'intern',
    'trainee',
  ],
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matches(haystack: string, patterns: string[] | undefined): boolean {
  return (patterns ?? []).some((pattern) => {
    const needle = normalize(pattern).trim();
    return needle.length > 0 && haystack.includes(needle);
  });
}

/**
 * Toutes les catégories qui correspondent, triées par priorité : la première donne la couleur.
 * Le marqueur [C] est cherché dans le nom, les autres critères dans le poste.
 */
export function classifyTags(
  employee: Employee,
  isGlobal: boolean,
  rules: CategoryRules,
): CategoryId[] {
  const identity = normalize(`${employee.worker} ${employee.jobTitle}`);
  const role = normalize(`${employee.jobTitle} ${employee.managementLevel}`);

  const tags: CategoryId[] = [];
  if (matches(identity, rules.contractor)) tags.push('contractor');
  if (isGlobal) tags.push('global');
  if (matches(role, rules.siteLead)) tags.push('siteLead');
  // Un manager n'est jamais étiqueté team lead : le team lead lui est subordonné.
  if (matches(role, rules.manager)) tags.push('manager');
  else if (matches(role, rules.teamLead)) tags.push('teamLead');
  if (matches(role, rules.apprentice)) tags.push('apprentice');
  if (tags.length === 0) tags.push('internal');

  return tags.sort((a, b) => CATEGORY_PRIORITY.indexOf(a) - CATEGORY_PRIORITY.indexOf(b));
}

export function classifyAll(
  employees: Employee[],
  globalKeys: Set<string>,
  rules: CategoryRules,
  exclusions: CategoryExclusions = {},
): Map<string, CategoryId[]> {
  const result = new Map<string, CategoryId[]>();
  for (const employee of employees) {
    const tags = classifyTags(employee, globalKeys.has(employee.key), rules);
    const excluded = exclusions[personId(employee)];
    const kept = excluded?.length ? tags.filter((tag) => !excluded.includes(tag)) : tags;
    result.set(employee.key, kept.length > 0 ? kept : ['internal']);
  }
  return result;
}
