import { beforeEach, describe, expect, it, vi } from 'vitest';

const { retrieveMultipleRecordsAsync } = vi.hoisted(() => ({
  retrieveMultipleRecordsAsync: vi.fn(),
}));

vi.mock('../generated', () => ({
  Wts_neuchatelorgsnapshotsService: { getAll: retrieveMultipleRecordsAsync },
}));

import { fetchEmployees } from './employeeSource';

function chunk(batchId: string, chunkIndex: number, createdOn: string, rows: unknown[]) {
  return {
    wts_batchid: batchId,
    wts_chunkindex: chunkIndex,
    wts_payload: JSON.stringify(rows),
    createdon: createdOn,
  };
}

describe('fetchEmployees', () => {
  beforeEach(() => retrieveMultipleRecordsAsync.mockReset());

  it('assembles the newest batch across pages and excludes inactive rows', async () => {
    retrieveMultipleRecordsAsync
      .mockResolvedValueOnce({ success: true, data: [{ wts_batchid: 'current' }] })
      .mockResolvedValueOnce({
        success: true,
        data: [
          chunk('current', 1, '2026-10-05T08:01:00Z', [
            { WORKER: 'Active Report', MANAGER: 'Manager', LEAVE_OR_NOT: 'A' },
          ]),
        ],
        skipToken: 'next-page',
      })
      .mockResolvedValueOnce({
        success: true,
        data: [
          chunk('current', 0, '2026-10-05T08:00:00Z', [
            { WORKER: 'Manager', MANAGER: '', LEAVE_OR_NOT: 'A' },
            { WORKER: 'Inactive Person', MANAGER: '', LEAVE_OR_NOT: 'L' },
          ]),
        ],
      });

    const snapshot = await fetchEmployees();

    expect(snapshot.employees.map((employee) => employee.worker)).toEqual([
      'Manager',
      'Active Report',
    ]);
    expect(snapshot.readAt?.toISOString()).toBe('2026-10-05T08:01:00.000Z');
    expect(retrieveMultipleRecordsAsync).toHaveBeenCalledTimes(3);
    expect(retrieveMultipleRecordsAsync.mock.calls[0][0]).toMatchObject({
      select: ['wts_batchid'],
      top: 1,
      orderBy: ['createdon desc'],
    });
    expect(retrieveMultipleRecordsAsync.mock.calls[1][0].filter).toBe("wts_batchid eq 'current'");
    expect(retrieveMultipleRecordsAsync.mock.calls[2][0]).toMatchObject({
      filter: "wts_batchid eq 'current'",
      skipToken: 'next-page',
    });
  });

  it('reports when no snapshot is available', async () => {
    retrieveMultipleRecordsAsync.mockResolvedValue({ success: true, data: [] });

    await expect(fetchEmployees()).rejects.toThrow('Aucun snapshot Dataverse disponible');
    expect(retrieveMultipleRecordsAsync).toHaveBeenCalledTimes(1);
  });

  it('escapes the batch identifier and supports legacy batches without an identifier', async () => {
    for (const batchId of ["batch'one", undefined]) {
      retrieveMultipleRecordsAsync
        .mockReset()
        .mockResolvedValueOnce({ success: true, data: [{ wts_batchid: batchId }] })
        .mockResolvedValueOnce({
          success: true,
          data: [
            chunk(batchId ?? '', 0, '2026-10-05T08:00:00Z', [
              { WORKER: 'Manager', MANAGER: '', LEAVE_OR_NOT: 'A' },
            ]),
          ],
        });
      await fetchEmployees();
      expect(retrieveMultipleRecordsAsync.mock.calls[1][0].filter).toBe(
        batchId ? "wts_batchid eq 'batch''one'" : 'wts_batchid eq null',
      );
    }
  });

  it('surfaces metadata and payload retrieval errors', async () => {
    retrieveMultipleRecordsAsync.mockResolvedValueOnce({
      success: false,
      error: { message: 'metadata failed' },
    });
    await expect(fetchEmployees()).rejects.toThrow('metadata failed');
    retrieveMultipleRecordsAsync
      .mockResolvedValueOnce({ success: true, data: [{ wts_batchid: 'current' }] })
      .mockResolvedValueOnce({ success: false, error: { message: 'payload failed' } });
    await expect(fetchEmployees()).rejects.toThrow('payload failed');
  });
});
