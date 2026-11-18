export interface Employee {
  /** Stable internal key */
  key: string;
  worker: string;
  leaveOrNot: string;
  jobTitle: string;
  managementLevel: string;
  email: string;
  id: string;
  department: string;
  service: string;
  subServices: string;
  departmentServices: string;
  manager: string;
  employeeId: string;
  costCenter: string;
  dateEntreeHr: string;
  dateEntreeSite: string;
  dateFinContrat: string;
}

export interface OrgNode {
  employee: Employee;
  children: OrgNode[];
  /** Total number of descendants (all levels) */
  descendants: number;
  depth: number;
  /** Rattachement manuel (dotted line) et non issu de la colonne MANAGER */
  dotted: boolean;
}

export interface OrgTree {
  roots: OrgNode[];
  /** Roots whose MANAGER cell was empty or unresolved */
  orphanCount: number;
  /** Employees whose MANAGER cell could not be resolved, avant rattachement manuel */
  unmanaged: Employee[];
  total: number;
}

/** Valeur enregistrée quand la personne n'a pas de dotted line sur le site. */
export const NO_DOTTED_LINE = 'N.A';

export type DottedLinks = Record<string, string>;

export type View = 'chart' | 'dotted' | 'config' | 'print';
