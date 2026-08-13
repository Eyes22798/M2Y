# M2Y Skeleton 修订依据（2026-08-13）

## 结论

本文件记录任务规划修订所依据的当前官方行为。它用于约束骨架实施，不代表已经完成构建验证。

## Expo 模板与 Development Build

- `create-expo-app@latest` 的默认 SDK 会随 Expo 发布节奏变化，项目必须通过 `--template default@sdk-56` 显式锁定 SDK 56。
- 2026-08-13 的 npm registry 验证显示 `expo-template-default@sdk-56` 可解析为 56.0.33；其依赖为 Expo 56、RN 0.85.3、React 19.2.3，并已包含 Reanimated 4.3.1、Worklets 0.8.3、Gesture Handler 与 `@expo/ui` 的 SDK 兼容版本。
- 新版 `create-expo-app` 默认可能生成 `AGENTS.md`、`CLAUDE.md` 与 `.claude/settings.json`，当前仓库已有自己的 Trellis/AI 规则，生成模板时使用 `--no-agents-md`，并禁止覆盖已有文件。
- Development Build 的标准方案包含 `expo-dev-client`。仅运行 `prebuild` 只能证明原生工程可以生成，不能证明原生依赖能够编译；本任务至少要完成 Android development debug binary 编译。
- `eas.json` 应提供 development、preview、production profiles；development 使用 `developmentClient: true`。

参考：

- <https://docs.expo.dev/more/create-expo/>
- <https://docs.expo.dev/develop/development-builds/introduction/>
- <https://docs.expo.dev/build/eas-json/>

## 三环境应用标识

- development、preview、production 需要不同的 Android Application ID 与 iOS Bundle Identifier。
- 标识必须写入环境求值后的 `android.package` 与 `ios.bundleIdentifier`，不能只写在 `extra`。
- `extra` 只承载 API URL、variant 等公开运行时配置；真正秘密不得放入客户端环境变量。

参考：<https://docs.expo.dev/build-reference/variants/>

## Expo config plugin 边界

- `expo-sqlite` 使用 config plugin 开启 `enableFTS: true` 与 `useSQLCipher: true`。
- `expo-secure-store` 和 `expo-local-authentication` 提供 config plugin，可配置 Android backup 与 Face ID 权限文案。
- Expo SDK 56 的 `expo-screen-capture` 没有内置 config plugin；只安装依赖并在运行时调用，不写入 `plugins`。

参考：

- <https://docs.expo.dev/versions/v56.0.0/sdk/sqlite/>
- <https://docs.expo.dev/versions/v56.0.0/sdk/securestore/>
- <https://docs.expo.dev/versions/v56.0.0/sdk/local-authentication/>
- <https://docs.expo.dev/versions/v56.0.0/sdk/screen-capture/>

## 动画、手势与键盘接线

- Expo SDK 56 对应的 Reanimated 4 需要 `react-native-worklets`；两者均通过 Expo 兼容矩阵安装。
- `react-native-gesture-handler` 需要根部 `GestureHandlerRootView`。
- `react-native-keyboard-controller` 需要根部 `KeyboardProvider`，并在加入原生依赖后重新构建 Development Build。

参考：

- <https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/>
- <https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/installation/>
- <https://kirillzyusko.github.io/react-native-keyboard-controller/docs/installation>
