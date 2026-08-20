# Crypto boundary

Only typed adapters to the `m2y-crypto` native module belong here. Never
implement cryptography in TypeScript. Raw native payloads must be decoded once
at this boundary, and native exception details must not be copied into UI state,
logs, analytics, or test snapshots.

The Spike adapter accepts only exact, versioned, redacted response shapes.
Checkpoint run IDs are opaque test identifiers used to resume after a real app
process restart; they are not identities, keys, fingerprints, or security
numbers.
