# Figma MVP 技术设计

## 1. Design Objective

在不突破现有 M0 安全和数据边界的前提下，实现一条真实可操作、可测试、可替换数据源的本地功能预览。UI 依赖应用级契约和共享 reducer，不直接依赖未来的 SQLite、加密或同步实现。

## 2. Route and Feature Shape

```text
app/
├── (main)/
│   ├── chat/index.tsx                 -> ChatScreen
│   ├── space/_layout.tsx              -> Space stack composition
│   ├── space/index.tsx                -> SpaceHomeScreen
│   ├── space/[itemId].tsx             -> SharedItemDetailScreen
│   └── settings/index.tsx             -> SettingsScreen
└── (auth)/*                            -> retained security-boundary placeholders

src/
├── domain/
│   ├── message/                        -> pure message contracts
│   └── shared-item/                    -> types, commands, reducer contracts
├── stores/preview-workspace/           -> Context, reducer, selectors, deterministic fixture
├── features/
│   ├── chat/
│   ├── save-to-space/
│   ├── space-home/
│   ├── shared-item/
│   └── settings/
└── design/
    ├── tokens/
    ├── primitives/
    └── patterns/                       -> sheet/dialog/empty-state patterns when reused
```

Routes remain composition-only. Feature screens consume typed hooks/selectors exposed by the preview workspace store. No component imports `expo-sqlite`, `src/native`, or `src/sync`.

## 3. Core Contracts

### Message

```text
Message
- id
- author: self | other
- body
- createdAtLabel
- savedItemIds[]
```

### SharedItem

Extend the existing contract without creating type-specific screen models:

```text
SharedItem
- id
- kind: note | task | agreement
- title
- detail
- status
- sourceMessageId?
- pinned
- updatedAtLabel
```

The existing broader taxonomy may retain future kinds in the domain, but MVP creation and filters expose only supported kinds. Unsupported fixture types are removed from visible production-like preview flows.

### Commands

One reducer owns all transitions:

```text
sendMessage(body)
saveMessageToSpace(messageId, kind, title, detail)
updateSharedItem(itemId, patch)
changeSharedItemStatus(itemId, status)
deleteSharedItem(itemId)
```

Command helpers validate IDs, trim required text, prevent duplicate `(sourceMessageId, kind)` pairs, and return typed results. Components translate result codes into UI feedback; they do not repeat the business rules.

## 4. State and Data Flow

```text
Chat input
  -> command validation
  -> preview reducer
  -> messages selector
  -> Chat render

Message action
  -> SaveToSpaceSheet draft
  -> save command
  -> preview reducer
  -> messages + sharedItems updated atomically
  -> Chat feedback and Space list render from the same state

Shared Item Detail
  -> edit/status/delete command
  -> preview reducer
  -> detail selector + Space selector
  -> consistent navigation result
```

`PreviewWorkspaceProvider` mounts inside the existing application provider chain. State is seeded once per app mount and intentionally has no persistence adapter. This provider is a replaceable application seam, not a fake repository claiming durable behavior.

## 5. UI Composition

- Reuse `MotionPressable`, `MotionReveal`, token files and safe-area conventions.
- Refine or replace `ScreenScaffold` only where the Figma header/navigation shape requires it; avoid a second competing screen shell.
- Add reusable patterns only after confirming at least two consumers:
  - `BottomSheet` for Save to Space and future item actions.
  - `ConfirmDialog` for deletion.
  - `EmptyState` for Space and filtered lists.
  - compact `StatusBadge`/`ItemCard` for Space and detail summary.
- Use `FlashList` for the Chat thread where it improves continuity with the existing 10K benchmark; use a simpler list for the small Space collection unless evidence requires virtualization.
- Keyboard behavior must keep the Chat composer and Save to Space inputs accessible.

## 6. Figma Adaptation Strategy

1. Treat the large frame as reference, not generated source code.
2. Before implementing each MVP screen, call Figma design context on the smallest useful vector/group ID and obtain a screen screenshot.
3. Map raw colors, spacing and type to existing tokens; extend tokens only for repeated values.
4. Download exact exported bitmap/vector assets to a stable project asset path. Use an existing glyph only after visual verification.
5. Compare screenshots at the design's approximate `388 x 844` logical viewport and a representative Android device size.
6. Record unavoidable differences caused by platform-native fonts, status bar or keyboard behavior.

## 7. Navigation Behavior

- Root continues to enter Chat for this preview; auth placeholders remain directly addressable but are not presented as completed onboarding.
- Space detail uses `[itemId]`; unknown IDs render a recoverable not-found state with navigation back to Space.
- Deleting the currently open item returns to Space only after the reducer confirms deletion.
- Bottom tabs stay visible on Chat, Space and Settings; detail presentation follows the closest Figma hierarchy without duplicating the tab route.

## 8. Error and Edge-Case Matrix

| Condition | Expected behavior |
|---|---|
| Blank Chat message | Send disabled or validation feedback; no message created |
| Blank Shared Item title | Save disabled or inline error; sheet remains open |
| Unknown message ID | Typed failure; no partial Shared Item created |
| Duplicate source message + type | Explain/open existing item; no duplicate |
| Unknown Shared Item ID | Recoverable not-found screen |
| Delete canceled | Item and navigation remain unchanged |
| Delete confirmed | Item removed atomically; linked message metadata updated |
| Empty Space/filter | Purpose-specific empty state and recovery action |
| Reduce Motion enabled | State changes remain usable without decorative animation |

## 9. Compatibility and Migration

- No persistent schema or migration is introduced.
- Existing static fixtures are replaced with deterministic store fixtures; no user data conversion is needed.
- Future SQLite or sync work can implement the same command/query boundary without changing route ownership or domain contracts.
- Auth placeholders remain until the dedicated security work approves real key lifecycle and native crypto boundaries.

## 10. Rollback and Operational Safety

- Main risk is concentrated in root provider composition, route shape and shared domain types.
- Keep fixture and reducer changes isolated so the preview provider can be removed without touching Figma primitives.
- Do not modify generated `android/` or `ios/` business code; native directories remain CNG outputs.
- Never log reducer payloads containing message bodies in production paths.

