import type { ConnectionMode } from '../../shared/contracts';

/** Side effects of one sync, supplied by the main-process composition root. */
export interface DataSyncDependencies<Snapshot> {
  /** Returns why a sync cannot run now (no session, no on-device server, busy), or null. */
  ready(): string | null;
  exportSnapshot(side: ConnectionMode): Promise<Snapshot>;
  /** Merges the other side's snapshot and returns how many records changed. */
  mergeSnapshot(side: ConnectionMode, snapshot: Snapshot): Promise<number>;
}

/** A refused sync with the stable IPC code the renderer branches on. */
export class DataSyncConflict extends Error {
  readonly code = 'CONFLICT';
  /** Args: message is user-facing. */
  constructor(message: string) { super(message); this.name = 'DataSyncConflict'; }
}

/** Keeps the on-device and the signed-in remote server in step, one sync at a time. */
export class DataSyncCoordinator<Snapshot> {
  private flight: Promise<{ changes: number }> | null = null;

  /** Args: dependencies performs every side effect. */
  constructor(private readonly dependencies: DataSyncDependencies<Snapshot>) {}

  /** Whether a sync is in progress; a backend switch or erase must wait for it. */
  running(): boolean { return this.flight !== null; }

  /**
   * Exports both sides first, then merges each into the other, so both converge on the newer copy
   * of every record. A concurrent call shares the run in flight. Raises DataSyncConflict when not ready.
   */
  run(): Promise<{ changes: number }> {
    if (this.flight) return this.flight;
    const reason = this.dependencies.ready();
    if (reason) return Promise.reject(new DataSyncConflict(reason));
    this.flight = this.perform().finally(() => { this.flight = null; });
    return this.flight;
  }

  /** Runs one complete two-way exchange. */
  private async perform(): Promise<{ changes: number }> {
    const device = await this.dependencies.exportSnapshot('device');
    const remote = await this.dependencies.exportSnapshot('remote');
    const changes = await this.dependencies.mergeSnapshot('remote', device) + await this.dependencies.mergeSnapshot('device', remote);
    return { changes };
  }
}
