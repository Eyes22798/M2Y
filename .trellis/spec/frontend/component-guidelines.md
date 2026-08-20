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

## Android Keyboard Layout Contract

Any screen that keeps an input or primary action at the bottom edge must use the layout primitives from `react-native-keyboard-controller`. `KeyboardProvider` only establishes the native boundary; it does not keep fixed content above the Android IME by itself.

```typescript
// Fixed composer or input-bearing bottom sheet.
<KeyboardAvoidingView automaticOffset behavior="padding" style={{ flex: 1 }}>
  {content}
</KeyboardAvoidingView>

// Scrollable detail form.
<KeyboardAwareScrollView
  bottomOffset={spacing.xl}
  keyboardDismissMode="interactive"
  keyboardShouldPersistTaps="handled"
>
  {form}
</KeyboardAwareScrollView>
```

Use the following contract:

| Surface | Required behavior | Acceptance assertion |
|---|---|---|
| Screen with a fixed composer | `KeyboardAvoidingView` with `automaticOffset` and `behavior="padding"` wraps the screen content | With the Android IME open, the complete composer and send action remain above the keyboard |
| Input-bearing `BottomSheet` | The sheet is bottom-aligned inside the same keyboard-avoiding wrapper | The focused field and primary footer action remain visible and clickable |
| Scrollable detail form | `KeyboardAwareScrollView` has a token-based `bottomOffset` and interactive dismissal | The user can reach the last action, dismiss the IME, and submit without an obscured control |

Good/base/bad cases:

- Good: the keyboard is open and the bottom action remains fully visible and clickable.
- Base: the keyboard is closed and the surface keeps its Figma-aligned spacing.
- Bad: any composer, footer action, or final form control intersects the reported IME bounds.

Tests must assert the wrapper configuration in Jest and exercise the affected flow. Final acceptance must also run on an Android device or emulator with the IME open; `tabBarHideOnKeyboard` and a Web viewport are not substitutes for this check.

```typescript
// Wrong: the provider and hidden tab bar do not resize this fixed composer.
<View style={{ flex: 1 }}>{contentAndComposer}</View>

// Correct: native keyboard progress drives the container inset.
<KeyboardAvoidingView automaticOffset behavior="padding" style={{ flex: 1 }}>
  {contentAndComposer}
</KeyboardAvoidingView>
```

## Styling

- Repeated colors, spacing, radius, type, and motion values come from `src/design/tokens`.
- Feature styles may compose tokens but must not introduce a second token object.
- Validate primary mobile screens at the approximate Figma logical viewport (`390 x 844`) and check browser console warnings during Web visual review.

## Common Mistakes

- Do not make every Figma state a route; sheets, dialogs, empty states, and errors are component states.
- Do not initialize form state in an effect solely to react to a newly selected entity. Key the mounted form by entity ID and initialize state from props.
- Do not present local preview states with labels such as synchronized, encrypted, or confirmed by the other party.
