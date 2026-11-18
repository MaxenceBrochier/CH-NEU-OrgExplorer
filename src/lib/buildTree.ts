import type { DottedLinks, Employee, OrgNode, OrgTree } from '../types';
import { NO_DOTTED_LINE } from '../types';

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Identifiant stable entre deux imports du même fichier, utilisé pour les dotted lines. */
export function personId(employee: Employee): string {
  return (
    employee.email.toLowerCase() ||
    employee.employeeId ||
    employee.id ||
    normalizeName(employee.worker)
  );
}

/** "Doe John" and "John Doe" produce the same key. */
function tokenKey(value: string): string {
  return normalizeName(value).split(' ').filter(Boolean).sort().join(' ');
}

function buildIndex(employees: Employee[]) {
  const byEmail = new Map<string, Employee>();
  const byId = new Map<string, Employee>();
  const byName = new Map<string, Employee>();
  const byTokens = new Map<string, Employee>();
  const nameCounts = new Map<string, number>();
  const tokenCounts = new Map<string, number>();

  for (const employee of employees) {
    if (employee.email) byEmail.set(employee.email.toLowerCase(), employee);
    if (employee.id) byId.set(employee.id.toLowerCase(), employee);
    if (employee.employeeId) byId.set(employee.employeeId.toLowerCase(), employee);
    const name = normalizeName(employee.worker);
    if (name) {
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
      if (!byName.has(name)) byName.set(name, employee);
    }
    const tokens = tokenKey(employee.worker);
    if (tokens) {
      tokenCounts.set(tokens, (tokenCounts.get(tokens) ?? 0) + 1);
      if (!byTokens.has(tokens)) byTokens.set(tokens, employee);
    }
  }
  // Noms partagés par plusieurs personnes : on ne s'en sert pas pour rattacher un manager (risque de faux positif).
  const ambiguousNames = new Set(
    [...nameCounts].filter(([, count]) => count > 1).map(([key]) => key),
  );
  const ambiguousTokens = new Set(
    [...tokenCounts].filter(([, count]) => count > 1).map(([key]) => key),
  );
  return { byEmail, byId, byName, byTokens, ambiguousNames, ambiguousTokens };
}

function resolveManager(
  raw: string,
  index: ReturnType<typeof buildIndex>,
): Employee | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const lower = value.toLowerCase();
  // L'e-mail et l'ID sont uniques : ils priment toujours.
  const exact = index.byEmail.get(lower) ?? index.byId.get(lower);
  if (exact) return exact;

  // Repli par nom : ignoré quand plusieurs employés portent ce nom, pour ne pas greffer le mauvais sous-arbre.
  const name = normalizeName(value);
  if (name && !index.ambiguousNames.has(name)) {
    const byName = index.byName.get(name);
    if (byName) return byName;
  }
  const tokens = tokenKey(value);
  if (tokens && !index.ambiguousTokens.has(tokens)) {
    return index.byTokens.get(tokens);
  }
  return undefined;
}

function sortNodes(nodes: OrgNode[]): void {
  nodes.sort((a, b) => {
    if (b.children.length !== a.children.length) {
      return b.children.length - a.children.length;
    }
    return a.employee.worker.localeCompare(b.employee.worker);
  });
  nodes.forEach((node) => sortNodes(node.children));
}

function measure(node: OrgNode, depth: number): number {
  node.depth = depth;
  node.descendants = node.children.reduce(
    (total, child) => total + measure(child, depth + 1),
    0,
  );
  return node.descendants + 1;
}

export function buildTree(employees: Employee[], dotted: DottedLinks = {}): OrgTree {
  const index = buildIndex(employees);
  const nodes = new Map<string, OrgNode>();
  const byPersonId = new Map<string, Employee>();
  for (const employee of employees) {
    nodes.set(employee.key, {
      employee,
      children: [],
      descendants: 0,
      depth: 0,
      dotted: false,
    });
    byPersonId.set(personId(employee), employee);
  }

  const parentOf = new Map<string, string>();
  const dottedKeys = new Set<string>();
  const unmanaged: Employee[] = [];
  for (const employee of employees) {
    const manager = resolveManager(employee.manager, index);
    if (manager && manager.key !== employee.key) {
      parentOf.set(employee.key, manager.key);
      continue;
    }
    unmanaged.push(employee);

    const target = dotted[personId(employee)];
    if (!target || target === NO_DOTTED_LINE) continue;
    const dottedManager = byPersonId.get(target);
    if (dottedManager && dottedManager.key !== employee.key) {
      parentOf.set(employee.key, dottedManager.key);
      dottedKeys.add(employee.key);
    }
  }

  // A manager chain that loops back on itself would hang the render: break it at the entry point.
  const hasCycle = (startKey: string): boolean => {
    const seen = new Set<string>([startKey]);
    let current = parentOf.get(startKey);
    while (current) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = parentOf.get(current);
    }
    return false;
  };

  const roots: OrgNode[] = [];
  let orphanCount = 0;
  for (const employee of employees) {
    const node = nodes.get(employee.key)!;
    node.dotted = dottedKeys.has(employee.key);
    const parentKey = parentOf.get(employee.key);
    const parent = parentKey ? nodes.get(parentKey) : undefined;
    if (parent && !hasCycle(employee.key)) {
      parent.children.push(node);
    } else {
      node.dotted = false;
      roots.push(node);
      // Racine sans rattachement effectif : manager absent/non résolu ou chaîne rompue pour casser un cycle.
      orphanCount += 1;
    }
  }

  sortNodes(roots);
  let total = 0;
  roots.forEach((root) => {
    total += measure(root, 0);
  });
  roots.sort((a, b) => b.descendants - a.descendants);

  return { roots, orphanCount, unmanaged, total };
}

export function flatten(node: OrgNode, out: OrgNode[] = []): OrgNode[] {
  out.push(node);
  node.children.forEach((child) => flatten(child, out));
  return out;
}

/** Chaîne des clés parentes (racine → parent direct) menant à `key`, hors `key` lui-même. */
export function ancestorKeys(roots: OrgNode[], key: string): string[] {
  const path: string[] = [];
  const walk = (node: OrgNode): boolean => {
    if (node.employee.key === key) return true;
    for (const child of node.children) {
      if (walk(child)) {
        path.unshift(node.employee.key);
        return true;
      }
    }
    return false;
  };
  roots.some(walk);
  return path;
}

/** Keys of every node kept when a filter matches, including the ancestors needed to reach them. */
export function filterKeys(roots: OrgNode[], matches: (node: OrgNode) => boolean): Set<string> {
  const kept = new Set<string>();
  const walk = (node: OrgNode): boolean => {
    const childKept = node.children.map(walk).some(Boolean);
    if (childKept || matches(node)) {
      kept.add(node.employee.key);
      return true;
    }
    return false;
  };
  roots.forEach(walk);
  return kept;
}
