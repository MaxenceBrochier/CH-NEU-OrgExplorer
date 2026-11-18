import * as XLSX from 'xlsx';
import { assertRequiredHeaders, toEmployees } from './employeeRows';
import type { Employee } from '../types';

/** Import manuel de secours : lit la première feuille d'un classeur déposé par l'utilisateur. */
export async function parseWorkbook(file: File): Promise<Employee[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The workbook does not contain any sheet.');
  }
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: '',
    raw: false,
  });

  if (rawRows.length === 0) {
    throw new Error('La première feuille est vide.');
  }

  assertRequiredHeaders(rawRows, 'la première feuille');

  const employees = toEmployees(rawRows);
  if (employees.length === 0) {
    throw new Error('Aucune ligne active (LEAVE_OR_NOT = "A") trouvée dans la première feuille.');
  }
  return employees;
}
