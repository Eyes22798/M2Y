import {
  applyWorkspaceMutation,
  decideWorkspaceCommand,
} from '@/application/workspace/decide-command';
import type {
  WorkspaceCommand,
  WorkspaceCommandOutcome,
  WorkspaceSession,
  WorkspaceSnapshot,
} from '@/application/workspace/contracts';

type InMemoryDependencies = Readonly<{
  nowMs?: () => number;
  createId?: (scope: 'message' | 'item') => string;
}>;

export class InMemoryWorkspaceSession implements WorkspaceSession {
  readonly initialSnapshot: WorkspaceSnapshot;
  private snapshot: WorkspaceSnapshot;
  private closed = false;
  private sequence = 1;

  constructor(
    snapshot: WorkspaceSnapshot,
    private readonly dependencies: InMemoryDependencies = {},
  ) {
    this.initialSnapshot = snapshot;
    this.snapshot = snapshot;
  }

  async execute(command: WorkspaceCommand): Promise<WorkspaceCommandOutcome> {
    if (this.closed) {
      return {
        result: { ok: false, reason: 'storage-unavailable' },
        snapshot: this.snapshot,
      };
    }
    const decision = decideWorkspaceCommand(this.snapshot, command, {
      nowMs: this.dependencies.nowMs?.() ?? Date.now(),
      createId:
        this.dependencies.createId ??
        ((scope) => {
          const id = `${scope}-memory-${this.sequence}`;
          this.sequence += 1;
          return id;
        }),
    });
    if (!decision.ok) return { result: decision.result, snapshot: this.snapshot };
    this.snapshot = applyWorkspaceMutation(this.snapshot, decision.mutation);
    return { result: decision.result, snapshot: this.snapshot };
  }

  async loadSnapshot(): Promise<WorkspaceSnapshot> {
    if (this.closed) throw new Error('Workspace session is closed');
    return this.snapshot;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
