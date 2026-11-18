import type { Employee } from '../types';

/** Normalizes a header cell so "Cost center", "COST_CENTER" and "cost-center" all match. */
function normalizeHeader(header: string): string {
  return header
    .trim()
    .toUpperCase()
    .replace(/[\s\-.]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
}

function pick(row: Record<string, unknown>, ...candidates: string[]): string {
  for (const candidate of candidates) {
    const value = row[candidate];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function toRow(raw: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    row[normalizeHeader(key)] = value;
  }
  return row;
}

// Chaque groupe = variantes acceptées pour une colonne obligatoire ; au moins une doit être présente.
const REQUIRED_HEADERS: string[][] = [
  ['WORKER', 'NAME', 'EMPLOYEE'],
  ['MANAGER'],
  ['LEAVE_OR_NOT'],
];

/** Vérifie que la source contient bien les colonnes clés avant de traiter les lignes. */
export function assertRequiredHeaders(rawRows: Record<string, unknown>[], source: string): void {
  if (rawRows.length === 0) {
    throw new Error(`${source} ne contient aucune ligne.`);
  }
  const headers = new Set(Object.keys(rawRows[0]).map(normalizeHeader));
  const missing = REQUIRED_HEADERS.filter(
    (group) => !group.some((candidate) => headers.has(candidate)),
  ).map((group) => group[0]);
  if (missing.length > 0) {
    throw new Error(
      `Colonnes manquantes dans ${source} : ${missing.join(', ')}. ` +
        'Vérifiez que la source est bien l’export attendu.',
    );
  }
}

/** Convertit des lignes brutes (classeur Excel ou connecteur Excel Online) en collaborateurs actifs. */
export function toEmployees(rawRows: Record<string, unknown>[]): Employee[] {
  const employees: Employee[] = [];
  rawRows.forEach((rawRow, index) => {
    const row = toRow(rawRow);
    const worker = pick(row, 'WORKER', 'NAME', 'EMPLOYEE');
    if (!worker) return;

    const leaveOrNot = pick(row, 'LEAVE_OR_NOT');
    // Seules les lignes actives (LEAVE_OR_NOT = A) sont retenues.
    if (leaveOrNot.trim().toUpperCase() !== 'A') return;

    employees.push({
      key: `row-${index}`,
      worker,
      leaveOrNot,
      jobTitle: pick(row, 'JOB_TITLE'),
      managementLevel: pick(row, 'MANAGMENT_LEVEL', 'MANAGEMENT_LEVEL'),
      email: pick(row, 'EMAIL'),
      id: pick(row, 'ID'),
      department: pick(row, 'DEPARTMENT'),
      service: pick(row, 'SERVICE'),
      subServices: pick(row, 'SUB_SERVICES', 'SUB_SERVICE'),
      departmentServices: pick(row, 'DEPARTMENT_SERVICES'),
      manager: pick(row, 'MANAGER'),
      employeeId: pick(row, 'ID_EMPLOYE', 'ID_EMPLOYEE'),
      costCenter: pick(row, 'COST_CENTER'),
      dateEntreeHr: pick(row, 'DATE_ENTREE_HR'),
      dateEntreeSite: pick(row, 'DATE_ENTREE_SITE'),
      dateFinContrat: pick(row, 'DATE_FIN_CONTRAT'),
    });
  });

  return employees;
}
