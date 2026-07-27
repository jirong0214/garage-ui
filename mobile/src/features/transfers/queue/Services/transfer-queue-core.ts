import {
  isTransferDirection,
  isTransferState,
  type CreateTransferInput,
  type TransferProgress,
  type TransferRecord,
  type TransferStateUpdate,
} from '../Models/transfer-record';
import {
  assertTransferStateTransition,
  isTerminalTransferState,
  normalizeTransferProgress,
} from '../Utils/transfer-state';

type DatabaseValue = string | number | null;

export interface TransferQueueDatabase {
  getFirstAsync<T>(sql: string, ...parameters: DatabaseValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...parameters: DatabaseValue[]): Promise<T[]>;
  runAsync(
    sql: string,
    ...parameters: DatabaseValue[]
  ): Promise<{ changes: number } | unknown>;
}

export interface TransferRow {
  id: string;
  direction: string;
  state: string;
  server_id: string;
  bucket: string;
  object_key: string;
  file_name: string;
  local_uri: string | null;
  bytes_transferred: number;
  bytes_total: number | null;
  attempt_count: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const selectColumns = `
  id, direction, state, server_id, bucket, object_key, file_name, local_uri,
  bytes_transferred, bytes_total, attempt_count, error_code, error_message,
  created_at, updated_at, started_at, finished_at
`;

export class TransferQueueRepository {
  constructor(
    private readonly database: TransferQueueDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async create(input: CreateTransferInput): Promise<TransferRecord> {
    assertRequiredText(input.id, 'id');
    assertRequiredText(input.serverId, 'serverId');
    assertRequiredText(input.bucket, 'bucket');
    assertRequiredText(input.key, 'key');
    assertRequiredText(input.fileName, 'fileName');

    const progress = normalizeTransferProgress(0, input.bytesTotal ?? null);
    const timestamp = this.now();
    const record: TransferRecord = {
      ...input,
      localUri: input.localUri ?? null,
      state: 'waiting',
      bytesTransferred: progress.bytesTransferred,
      bytesTotal: progress.bytesTotal,
      attemptCount: 0,
      errorCode: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      finishedAt: null,
    };

    await this.database.runAsync(
      `INSERT INTO transfer_queue (
         id, direction, state, server_id, bucket, object_key, file_name, local_uri,
         bytes_transferred, bytes_total, attempt_count, error_code, error_message,
         created_at, updated_at, started_at, finished_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      record.id,
      record.direction,
      record.state,
      record.serverId,
      record.bucket,
      record.key,
      record.fileName,
      record.localUri,
      record.bytesTransferred,
      record.bytesTotal,
      record.attemptCount,
      record.errorCode,
      record.errorMessage,
      record.createdAt,
      record.updatedAt,
      record.startedAt,
      record.finishedAt,
    );

    return record;
  }

  async list(serverId: string): Promise<TransferRecord[]> {
    const rows = await this.database.getAllAsync<TransferRow>(
      `SELECT ${selectColumns}
       FROM transfer_queue
       WHERE server_id = ?
       ORDER BY
         CASE WHEN state IN ('completed', 'failed', 'cancelled') THEN 1 ELSE 0 END,
         updated_at DESC`,
      serverId,
    );
    return rows.map(mapTransferRow);
  }

  async get(id: string): Promise<TransferRecord | null> {
    const row = await this.database.getFirstAsync<TransferRow>(
      `SELECT ${selectColumns}
       FROM transfer_queue
       WHERE id = ?
       LIMIT 1`,
      id,
    );
    return row ? mapTransferRow(row) : null;
  }

  async updateProgress(id: string, progress: TransferProgress): Promise<void> {
    const current = await this.requireRecord(id);
    if (isTerminalTransferState(current.state)) {
      throw new Error(`Cannot update progress for terminal transfer ${id}`);
    }

    const normalized = normalizeTransferProgress(
      progress.bytesTransferred,
      progress.bytesTotal,
    );
    const result = await this.database.runAsync(
      `UPDATE transfer_queue
       SET bytes_transferred = ?, bytes_total = ?, updated_at = ?
       WHERE id = ? AND state = ?`,
      normalized.bytesTransferred,
      normalized.bytesTotal,
      this.now(),
      id,
      current.state,
    );
    assertChanged(result, id);
  }

  async updateState(id: string, update: TransferStateUpdate): Promise<void> {
    const current = await this.requireRecord(id);
    assertTransferStateTransition(current.direction, current.state, update.state);

    const timestamp = this.now();
    const isPreparing = update.state === 'preparing';
    const isErrorState = update.state === 'retrying' || update.state === 'failed';
    const result = await this.database.runAsync(
      `UPDATE transfer_queue
       SET state = ?,
           local_uri = ?,
           attempt_count = ?,
           error_code = ?,
           error_message = ?,
           updated_at = ?,
           started_at = ?,
           finished_at = ?
       WHERE id = ? AND state = ?`,
      update.state,
      update.localUri === undefined ? current.localUri : update.localUri,
      current.attemptCount + (isPreparing ? 1 : 0),
      isErrorState ? (update.errorCode ?? null) : null,
      isErrorState ? (update.errorMessage ?? null) : null,
      timestamp,
      current.startedAt ?? (isPreparing ? timestamp : null),
      isTerminalTransferState(update.state) ? timestamp : null,
      id,
      current.state,
    );
    assertChanged(result, id);
  }

  async removeHistory(serverId: string): Promise<number> {
    const result = await this.database.runAsync(
      `DELETE FROM transfer_queue
       WHERE server_id = ? AND state IN ('completed', 'failed', 'cancelled')`,
      serverId,
    );
    return changedRows(result);
  }

  async remove(id: string): Promise<void> {
    const current = await this.requireRecord(id);
    if (!isTerminalTransferState(current.state)) {
      throw new Error(`Cannot remove active transfer ${id}`);
    }
    const result = await this.database.runAsync(
      `DELETE FROM transfer_queue
       WHERE id = ? AND state = ?`,
      id,
      current.state,
    );
    assertChanged(result, id);
  }

  private async requireRecord(id: string): Promise<TransferRecord> {
    const record = await this.get(id);
    if (!record) throw new Error(`Transfer not found: ${id}`);
    return record;
  }
}

export function mapTransferRow(row: TransferRow): TransferRecord {
  if (!isTransferDirection(row.direction)) {
    throw new Error(`Unknown transfer direction: ${row.direction}`);
  }
  if (!isTransferState(row.state)) {
    throw new Error(`Unknown transfer state: ${row.state}`);
  }

  const progress = normalizeTransferProgress(row.bytes_transferred, row.bytes_total);
  if (!Number.isSafeInteger(row.attempt_count) || row.attempt_count < 0) {
    throw new Error('Invalid transfer attempt count');
  }

  return {
    id: row.id,
    direction: row.direction,
    state: row.state,
    serverId: row.server_id,
    bucket: row.bucket,
    key: row.object_key,
    fileName: row.file_name,
    localUri: row.local_uri,
    bytesTransferred: progress.bytesTransferred,
    bytesTotal: progress.bytesTotal,
    attemptCount: row.attempt_count,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function changedRows(result: { changes: number } | unknown): number {
  if (
    typeof result === 'object' &&
    result !== null &&
    'changes' in result &&
    typeof result.changes === 'number'
  ) {
    return result.changes;
  }
  return 0;
}

function assertChanged(result: { changes: number } | unknown, id: string): void {
  if (changedRows(result) === 0) {
    throw new Error(`Transfer changed concurrently or no longer exists: ${id}`);
  }
}

function assertRequiredText(value: string, field: string): void {
  if (value.trim().length === 0) throw new Error(`${field} is required`);
}
