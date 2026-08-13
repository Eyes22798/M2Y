# Frontend State Management

## Scenario: Session-Only Preview Workspace

### 1. Scope / Trigger

- Use this pattern when two or more feature screens need to share deterministic preview data before a persistent repository or sync service exists.
- The preview workspace is an application seam, not a persistence or security claim. It resets when `PreviewWorkspaceProvider` remounts.
- Keep domain types and the reducer framework-free. UI components consume commands and translate typed failures into copy.

### 2. Signatures

```typescript
type PreviewWorkspaceCommands = Readonly<{
  sendMessage(body: string): CommandResult;
  saveMessageToSpace(input: {
    messageId: string;
    kind: 'note' | 'task' | 'agreement';
    title: string;
    detail: string;
  }): CommandResult;
  updateSharedItem(input: {
    itemId: string;
    title: string;
    detail: string;
  }): CommandResult;
  changeSharedItemStatus(itemId: string, status: SharedItemStatus): CommandResult;
  deleteSharedItem(itemId: string): CommandResult;
}>;
```

`PreviewWorkspaceProvider` exposes `{ state, commands }` through `usePreviewWorkspace()`.

### 3. Contracts

- `sendMessage` trims input and allocates an ID from `nextMessageSequence`.
- `saveMessageToSpace` requires an existing source message and a nonblank title. The pair `(sourceMessageId, kind)` is unique.
- A successful save updates `sharedItems` and the source message's `savedItemIds` in the same reducer transition.
- Deleting a shared item also removes its ID from every linked message.
- Initial fixtures are deterministic, contain no secrets, and use the same domain types as runtime-created data.
- Components must not directly mutate preview state or duplicate reducer validation.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Blank message body | `blank-message`; state unchanged |
| Blank shared-item title | `blank-title`; state unchanged |
| Unknown source message | `message-not-found`; no partial item |
| Duplicate source message and kind | `duplicate-item` with `existingItemId`; no duplicate |
| Unknown shared item for edit/status/delete | `item-not-found`; state unchanged |
| Valid delete | Item and all linked message metadata are updated atomically |

### 5. Good / Base / Bad Cases

- Good: Chat and Space render from the same provider, and UI feedback is derived from typed command results.
- Base: screen-local draft text and filter selection remain component state.
- Bad: claiming the preview store is encrypted, durable, synchronized, or confirmed by another device.
- Bad: implementing save validation independently in Chat, Space, and the detail screen.

### 6. Tests Required

- Reducer tests assert send, save, duplicate prevention, edit, status change, delete, and unknown-ID behavior.
- Flow tests assert message sending, Save-to-Space creation, Space filtering/navigation, and confirmed deletion.
- Delete tests must assert both item removal and cleanup of the source message's `savedItemIds`.
- Provider tests must prove app content mounts inside the shared state boundary.

### 7. Wrong vs Correct

#### Wrong

```typescript
const item = { id: Date.now().toString(), title };
setItems((current) => [...current, item]);
```

This bypasses typed validation and cannot atomically update the source message.

#### Correct

```typescript
const result = commands.saveMessageToSpace({ messageId, kind, title, detail });
if (!result.ok) showCommandFeedback(result.reason);
```

## State Categories

- Component state: form drafts, selected filters, temporary dialog visibility.
- Shared session state: messages and shared items owned by `PreviewWorkspaceProvider`.
- Persistent or server state: not implemented yet; add a repository boundary before introducing either.

## Common Mistakes

- Do not mirror shared items into screen-local state. Select them directly from the provider.
- Do not write to refs during render to work around stale command closures. Commands should declare the state slices they read in hook dependencies.
- Do not log message bodies or shared-item details while debugging state transitions.
