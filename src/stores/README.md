# Stores

`SecureWorkspaceProvider` mirrors the application controller's boot and lock state. It does not
open databases or read keys itself.

`WorkspaceProvider` owns the last committed workspace snapshot and exposes async commands backed by
the active workspace session. React state changes only after a command transaction commits.

Feature-only drafts and presentation state stay local to their components. Store modules must not
import concrete data or native adapters; runtime composition belongs in `src/bootstrap`.
