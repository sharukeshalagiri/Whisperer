import type { ConnectionMode } from '../../shared/contracts';

/** Side effects of one backend switch, supplied by the main-process composition root. */
export interface ConnectionModeDependencies {
  mode(): ConnectionMode;
  persist(mode: ConnectionMode): void;
  /** Returns why a switch must wait (active dictation, meeting or transform), or null. */
  busy(): string | null;
  /** Invalidates in-flight requests and drops the current account scope. */
  detach(): void;
  /** Activates the scope, shortcuts and state for the new mode. */
  attach(mode: ConnectionMode): void;
  startLocal(): Promise<void>;
  stopLocal(): Promise<void>;
  log(message: string): void;
}

/** A refused switch with the stable IPC code the renderer branches on. */
export class ConnectionModeConflict extends Error {
  readonly code = 'CONFLICT';
  /** Args: message is user-facing. */
  constructor(message: string) { super(message); this.name = 'ConnectionModeConflict'; }
}

/** Switches the one active backend without letting work, caches or credentials cross between them. */
export class ConnectionModeCoordinator {
  private active = false;

  /** Args: dependencies performs every side effect. */
  constructor(private readonly dependencies: ConnectionModeDependencies) {}

  /** Whether a switch is in progress; callers treat this as busy. */
  switching(): boolean { return this.active; }

  /** Switches backend. Raises ConnectionModeConflict while busy or while another switch runs. */
  async switchTo(mode: ConnectionMode): Promise<void> {
    if (this.dependencies.mode() === mode && !this.active) return;
    if (this.active) throw new ConnectionModeConflict('A connection change is already in progress.');
    if (this.dependencies.busy()) throw new ConnectionModeConflict('Finish the current recording, meeting or transform before switching.');
    this.active = true;
    try {
      this.dependencies.detach();
      if (mode === 'remote') await this.dependencies.stopLocal();
      this.dependencies.persist(mode);
      this.dependencies.attach(mode);
    } finally {
      this.active = false;
    }
    // The owned server starts in the background and reports its own progress; it never downloads here.
    if (mode === 'device') {
      void this.dependencies.startLocal().catch((error: unknown) => this.dependencies.log(`On-device server start failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    }
  }
}
