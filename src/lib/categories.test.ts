import { describe, expect, it } from 'vitest';
import { classifyAll, classifyTags, DEFAULT_RULES } from './categories';
import type { Employee } from '../types';

function emp(partial: Partial<Employee>): Employee {
  return {
    key: 'k',
    worker: 'X',
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

describe('classifyTags', () => {
  it('detects a contractor from the [C] marker in the name', () => {
    const tags = classifyTags(emp({ worker: 'John Doe [C]' }), false, DEFAULT_RULES);
    expect(tags).toContain('contractor');
  });

  it('prefers manager over team lead', () => {
    const tags = classifyTags(emp({ jobTitle: 'Production Manager' }), false, DEFAULT_RULES);
    expect(tags).toContain('manager');
    expect(tags).not.toContain('teamLead');
  });

  it('tags an apprentice', () => {
    const tags = classifyTags(emp({ jobTitle: 'Apprenti logistique' }), false, DEFAULT_RULES);
    expect(tags).toContain('apprentice');
  });

  it('falls back to internal when nothing matches', () => {
    const tags = classifyTags(emp({ jobTitle: 'Operator' }), false, DEFAULT_RULES);
    expect(tags).toEqual(['internal']);
  });

  it('marks a global function', () => {
    const tags = classifyTags(emp({ jobTitle: 'Operator' }), true, DEFAULT_RULES);
    expect(tags).toContain('global');
  });
});

describe('classifyAll exclusions', () => {
  const person = emp({ key: 'a', email: 'a@x.ch', jobTitle: 'Production Manager' });

  it('removes an excluded category for that person only', () => {
    const result = classifyAll([person], new Set(), DEFAULT_RULES, { 'a@x.ch': ['manager'] });
    expect(result.get('a')).toEqual(['internal']);
  });

  it('keeps the other categories', () => {
    const lead = emp({ key: 'b', email: 'b@x.ch', jobTitle: 'Head of Quality', worker: 'B [C]' });
    const result = classifyAll([lead], new Set(), DEFAULT_RULES, { 'b@x.ch': ['siteLead'] });
    expect(result.get('b')).not.toContain('siteLead');
    expect(result.get('b')).toContain('contractor');
  });
});