import { Wts_neuchatelorgsnapshotsService as SnapshotService } from '../generated';
import { assertRequiredHeaders, toEmployees } from './employeeRows';
import type { Employee } from '../types';

export const SOURCE_LABEL = 'Snapshot Dataverse — Neuchatel_employee_list.xlsx';

const MAX_PAGES = 100;

export interface EmployeeSnapshot {
  employees: Employee[];
  readAt: Date | null;
}

interface SnapshotChunk {
  wts_batchid?: string;
  wts_chunkindex?: number;
  wts_payload?: string;
  createdon?: string;
}

async function fetchChunks(batchId: string | undefined): Promise<SnapshotChunk[]> {
  const chunks: SnapshotChunk[] = [];
  let skipToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await SnapshotService.getAll({
      select: ['wts_batchid', 'wts_chunkindex', 'wts_payload', 'createdon'],
      filter:
        batchId == null ? 'wts_batchid eq null' : `wts_batchid eq '${batchId.replace(/'/g, "''")}'`,
      orderBy: ['wts_chunkindex asc'],
      skipToken,
    });
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Lecture du snapshot Dataverse impossible.');
    }

    chunks.push(...(result.data ?? []).filter((chunk) => Boolean(chunk.wts_payload)));
    skipToken = result.skipToken;
    if (!skipToken) return chunks;
  }

  throw new Error('Le snapshot contient trop de lots pour être lu en une seule synchronisation.');
}

function parseChunk(payload: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(payload);
  if (!Array.isArray(parsed)) {
    throw new Error('Le snapshot Dataverse ne contient pas un tableau JSON.');
  }
  return parsed as Record<string, unknown>[];
}

export async function fetchEmployees(): Promise<EmployeeSnapshot> {
  const latest = await SnapshotService.getAll({
    select: ['wts_batchid'],
    filter: "wts_payload ne null and wts_payload ne ''",
    orderBy: ['createdon desc'],
    top: 1,
  });
  if (!latest.success) {
    throw new Error(latest.error?.message ?? 'Lecture du snapshot Dataverse impossible.');
  }
  const batch = latest.data?.length ? await fetchChunks(latest.data[0].wts_batchid) : [];
  batch.sort((left, right) => (left.wts_chunkindex ?? 0) - (right.wts_chunkindex ?? 0));
  if (batch.length === 0) {
    throw new Error('Aucun snapshot Dataverse disponible. Le flow quotidien doit être exécuté.');
  }

  const rows = batch.flatMap((chunk) => parseChunk(chunk.wts_payload ?? ''));
  assertRequiredHeaders(rows, 'le snapshot Dataverse');

  const employees = toEmployees(rows);
  if (employees.length === 0) {
    throw new Error('Aucune ligne active (LEAVE_OR_NOT = "A") dans le snapshot Dataverse.');
  }

  const latestCreatedOn = batch.reduce(
    (latest, chunk) => ((chunk.createdon ?? '') > latest ? (chunk.createdon ?? '') : latest),
    '',
  );
  const readAt = latestCreatedOn ? new Date(latestCreatedOn) : null;
  return { employees, readAt };
}
