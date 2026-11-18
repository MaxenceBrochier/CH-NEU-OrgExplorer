import { describe, expect, it } from 'vitest';
import { buildTree, flatten, personId } from './buildTree';
import type { Employee } from '../types';

function emp(partial: Partial<Employee> & { key: string; worker: string }): Employee {
  return {
    leaveOrNot: 'A',
    jobTitle: '',
    managementLevel: '',
    email: '',
    id: '',
    department: '',
    service: '',
    subServices: '',
    departmentServices: '',
    manager: '',
    employeeId: '',
    costCenter: '',
    dateEntreeHr: '',
    dateEntreeSite: '',
    dateFinContrat: '',
    ...partial,
  };
}

describe('buildTree', () => {
  it('resolves a manager by email', () => {
    const boss = emp({ key: 'a', worker: 'Alice Boss', email: 'alice@x.io' });
    const report = emp({ key: 'b', worker: 'Bob', email: 'bob@x.io', manager: 'alice@x.io' });
    const tree = buildTree([boss, report]);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].employee.key).toBe('a');
    expect(tree.roots[0].children[0].employee.key).toBe('b');
    expect(tree.total).toBe(2);
  });

  it('does not attach when the manager name is ambiguous (homonyms)', () => {
    const jean1 = emp({ key: 'j1', worker: 'Jean Martin', email: 'jean1@x.io' });
    const jean2 = emp({ key: 'j2', worker: 'Jean Martin', email: 'jean2@x.io' });
    const report = emp({ key: 'r', worker: 'Rémy', manager: 'Jean Martin' });
    const tree = buildTree([jean1, jean2, report]);
    // "Jean Martin" est ambigu : le report reste sans manager plutôt que d'être mal rattaché.
    expect(tree.unmanaged.map((e) => e.key)).toContain('r');
    const remy = flatten(tree.roots.find((r) => r.employee.key === 'r')!);
    expect(remy[0].children).toHaveLength(0);
  });

  it('breaks manager cycles without hanging', () => {
    const a = emp({ key: 'a', worker: 'A', email: 'a@x.io', manager: 'b@x.io' });
    const b = emp({ key: 'b', worker: 'B', email: 'b@x.io', manager: 'a@x.io' });
    const tree = buildTree([a, b]);
    expect(tree.total).toBe(2);
    expect(tree.roots.length).toBeGreaterThanOrEqual(1);
  });

  it('attaches an unmanaged person through a dotted link', () => {
    const lead = emp({ key: 'l', worker: 'Lead', email: 'lead@x.io' });
    const solo = emp({ key: 's', worker: 'Solo', email: 'solo@x.io' });
    const links = { [personId(solo)]: personId(lead) };
    const tree = buildTree([lead, solo], links);
    const leadNode = tree.roots.find((r) => r.employee.key === 'l')!;
    expect(leadNode.children.some((c) => c.employee.key === 's' && c.dotted)).toBe(true);
  });
});
