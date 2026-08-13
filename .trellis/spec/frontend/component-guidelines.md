# Frontend Component Guidelines

## Component Boundaries

- Expo Router route files compose one feature screen and do not own business rules.
- Reusable interaction structures belong in `src/design/patterns/`; feature-specific forms remain under their feature.
- Every pressable requires a user-readable `accessibilityLabel`. Disabled controls expose `accessibilityState` through `MotionPressable`.
- Decorative motion uses shared tokens and respects system Reduce Motion.

## Cross-Platform Icons

Use `AppIcon` from `src/design/primitives/AppIcon.tsx` instead of importing `SymbolView` in a feature.

```typescript
<AppIcon color={colors.accent} name="space" size={22} />
```

`AppIconName` is the supported icon contract. Each new name must define:

- an SF Symbol for iOS;
- an exact Material Symbols glyph for Android;
- a legible text fallback for Web.

`expo-symbols` can load without drawing a glyph in an Expo Web preview. The Web fallback is therefore required even when Android export includes the Material Symbols font.

## Test Isolation

- Jest component tests mock `expo-symbols` as a plain React Native view.
- Jest flow tests mock `FlashList` as a deterministic list and Reanimated hooks as immediate values.
- These mocks isolate native initialization only; assertions remain focused on accessibility labels, visible state, typed command results, and navigation.
- Do not suppress Worklets initialization errors or React `act` warnings. Replace the inappropriate native runtime boundary in the test environment.

## Styling

- Repeated colors, spacing, radius, type, and motion values come from `src/design/tokens`.
- Feature styles may compose tokens but must not introduce a second token object.
- Validate primary mobile screens at the approximate Figma logical viewport (`390 x 844`) and check browser console warnings during Web visual review.

## Common Mistakes

- Do not make every Figma state a route; sheets, dialogs, empty states, and errors are component states.
- Do not initialize form state in an effect solely to react to a newly selected entity. Key the mounted form by entity ID and initialize state from props.
- Do not present local preview states with labels such as synchronized, encrypted, or confirmed by the other party.
