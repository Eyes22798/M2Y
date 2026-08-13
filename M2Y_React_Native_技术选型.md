# M2Y React Native 技术选型

> **文档版本**：V1.0  
> **日期**：2026-08-12  
> **目标读者**：M2Y 客户端/服务端开发者、产品与设计团队  
> **前置文档**：`M2Y_PRD_修订版.md`  
> **决策状态**：建议立项基线，E2EE 与 E2E 测试工具需先完成技术验证

---

## 0. 结论摘要

M2Y 客户端建议采用以下基线：

```text
Expo SDK 56 + React Native 0.85 + React 19.2 + TypeScript
Expo Development Build + CNG/Prebuild + New Architecture + Hermes v1
Expo Router
Reanimated + Gesture Handler
FlashList v2
Expo SQLite + SQLCipher + FTS5
Repository + Outbox/Inbox Sync Engine
Zustand（仅 UI 状态）
```

需要复杂视觉时按层增加：

- `React Native Skia`：粒子、路径、渐变、光效等 Canvas 绘制型动画。
- `Rive`：设计师交付、需要状态机和用户互动的品牌动画。
- `Lottie`：固定时间轴、弱交互动画；不与 Rive 同时作为主方案。

服务端建议采用：

```text
TypeScript + NestJS（Fastify Adapter）
PostgreSQL + Redis + S3 兼容对象存储
HTTP cursor sync + WebSocket wake-up
服务端只处理密文 envelope、设备、cursor、队列与密文文件
```

最重要的架构约束：

1. **客户端 SQLite 是业务数据唯一真相**，不是 Zustand，也不是网络缓存。
2. **先写本地事务，再异步同步**，业务修改与 outbox 必须同事务提交。
3. **动画状态与业务状态分离**，Reanimated SharedValue 不存业务实体。
4. **E2EE 不在 JavaScript 中自研**；必须基于经评审的原生实现/绑定。
5. **从第一天使用 Development Build**；Expo Go 不能验证 SQLCipher、Face ID、Rive、E2EE 原生模块和完整推送。
6. **高动画密度不等于所有页面都自定义动效**；优先原生转场，只对关键动作投入复杂动画。

### 0.1 版本口径

截至 2026-08-12，稳定的 Expo SDK 56 对应 React Native 0.85 与 React 19.2；React Native 官方版本页虽已列出更高版本，但生产项目应跟随当前 Expo 稳定 SDK 的兼容矩阵，而不是单独追最新 RN。Expo SDK 55 及以上只能运行 New Architecture，无法回退 Legacy Architecture。[Expo SDK 56](https://expo.dev/changelog/sdk-56)、[Expo New Architecture](https://docs.expo.dev/guides/new-architecture/)

建仓时应使用 `create-expo-app` 生成当日稳定模板，并提交 lockfile；本文中的版本是立项基线，不应手工组合不受 Expo SDK 支持的依赖版本。

---

## 1. 选型目标与约束

### 1.1 业务目标

技术方案需要支持：

- 单一双人关系与私密 Chat。
- Space Home、Shared Item、Activity 与统一搜索。
- Chat ↔ Space 双向关联。
- 消息长按、多选、底部面板与跨页面视觉连续性。
- 本地优先、离线创建、重连同步、幂等与冲突处理。
- 文本、图片和加密文件。
- 应用锁、屏幕保护、密钥安全存储和服务端零明文。
- iOS / Android 高一致性，同时允许保留平台原生交互。

### 1.2 技术约束

- 客户端明确选择 React Native。
- 开发者当前主要经验为 Vue 前端，原生 Swift/Kotlin 经验有限。
- 动画与手势较多，聊天列表、键盘和低端 Android 性能是高风险区。
- M2Y 是隐私产品，不能依赖服务端读取内容完成搜索、合并或推荐。
- P0 是移动端，不为 Web 抽象牺牲移动端安全与体验。
- RN New Architecture 是强制前提，所有原生依赖必须通过兼容性检查。

### 1.3 选型原则

| 原则 | 技术含义 |
|---|---|
| 本地优先 | UI 读写本地数据库；网络是同步通道，不是页面数据源 |
| 原生能力可控 | 使用 Expo Development Build 与 CNG，保留 Swift/Kotlin 扩展能力 |
| 动画分层 | 页面转场、组件动效、手势动效、Canvas、设计资产分别选工具 |
| 少而稳 | 不同时引入多套路由、状态、ORM、UI Kit 与动画系统 |
| 可替换边界 | 加密、同步、存储、通知通过接口封装，不侵入组件 |
| 安全默认 | 密钥不进 JS 持久化 Store；日志、通知、崩溃报告不含内容 |
| 先测后抽象 | 先做四个技术 Spike，再固化目录和基础设施 |

---

## 2. 总体技术架构

```text
┌─────────────────────────────────────────────────────────────┐
│ React Native UI                                              │
│ Expo Router / Screens / Components / Motion / Feature Hooks │
└──────────────────────────────┬──────────────────────────────┘
                               │ commands + reactive reads
┌──────────────────────────────▼──────────────────────────────┐
│ Application Layer                                           │
│ Use Cases / Commands / Validation / Conflict Rules          │
└──────────────────────────────┬──────────────────────────────┘
                               │ transaction
┌──────────────────────────────▼──────────────────────────────┐
│ Local Data Layer                                             │
│ SQLCipher SQLite / FTS5 / Repository / Migrations           │
│ messages / items / activity / outbox / inbox / assets       │
└──────────────┬───────────────────────────────┬──────────────┘
               │ local subscriptions           │ queued ops
               │                               ▼
               │                    ┌─────────────────────────┐
               │                    │ Sync Engine             │
               │                    │ encrypt / upload / pull │
               │                    │ cursor / retry / ack    │
               │                    └────────────┬────────────┘
               │                                 │ ciphertext only
┌──────────────▼─────────────┐        ┌──────────▼─────────────┐
│ Native Security Boundary   │        │ M2Y Backend            │
│ SecureStore / Biometrics   │        │ NestJS / PG / Redis    │
│ E2EE native module         │        │ S3 ciphertext assets   │
│ Screen capture / Keychain  │        │ HTTP sync + WebSocket  │
└────────────────────────────┘        └────────────────────────┘
```

### 2.1 数据流

```text
用户操作
  → Feature Hook 调用 Use Case
  → 校验业务规则
  → SQLite 事务写入实体 + Activity + Outbox
  → Repository 查询更新，UI 立即刷新
  → Sync Engine 读取 Outbox
  → 原生 E2EE 模块生成/加密 envelope
  → HTTP 上传，服务端返回 cursor/ack
  → Outbox 标记完成
```

接收方向：

```text
WebSocket 收到“有更新”信号
  → 使用上次 cursor 发起 HTTP sync
  → 下载密文 envelope
  → 验证发送设备与 envelope
  → 原生模块解密
  → Inbox 幂等检查
  → SQLite 事务应用操作并推进 cursor
  → UI 自动刷新
```

WebSocket 只做低延迟 wake-up。App 被系统暂停、断网或 socket 丢包后，HTTP cursor sync 仍能恢复完整状态。

---

## 3. 客户端基础框架

### 3.1 选择 Expo Development Build

**结论：选择 Expo managed/CNG 工作流，但从第一天使用 Development Build；不使用 Expo Go 作为正式开发环境。**

Expo Development Build 是可以加入任意原生库和原生配置的自定义开发客户端，适合生产 App。CNG/Prebuild 根据 app config 和 config plugins 生成 iOS/Android 工程，减少双平台原生工程的长期维护负担。[Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)、[Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)

选择理由：

- 用户是 Vue 前端，Expo CLI、Development Build、EAS 能降低第一阶段原生工具链负担。
- M2Y 需要 SQLCipher、生物识别、屏幕保护、推送、Rive 与 E2EE 原生模块，Expo Go 无法覆盖。
- CNG 能把大多数原生配置收口在 `app.config.ts` 与 config plugins。
- 仍可通过 Expo Modules API 写 Swift/Kotlin，通过 TurboModule/C++ 接入更底层能力。

规则：

- `ios/`、`android/` 视为可再生构建产物；不直接手改后依赖其永久存在。
- 所有原生修改必须进入 config plugin、Expo Module 或独立原生包。
- PR CI 至少执行一次 `expo prebuild --clean` 构建验证，防止生成工程漂移。
- 使用 `npx expo install` 安装 Expo/RN 原生依赖，避免不兼容版本。

### 3.2 为什么不选纯 React Native CLI

RN CLI 在高度原生定制、已有成熟原生团队时更直接；但本项目首要风险是加密、同步与动效，而不是维护 Gradle、CocoaPods 和两套原生配置。CLI 会让当前单前端开发者过早承担升级和原生工程维护成本。

以下情况出现时才重新评估：

- E2EE 底层绑定无法用 CNG/config plugin 稳定表达。
- 需要长期大量手写 AppDelegate、Android Application 或多个 Extension/Target。
- 团队已有独立 iOS/Android 工程师并希望直接控制每次原生升级。

Expo 不等于“不能写原生代码”，也不等于必须使用 Expo 的云服务。

### 3.3 TypeScript 配置

- 开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`。
- 使用 discriminated union 表达 Message、Shared Item 和 Operation 类型。
- 网络/密文解密后的外部输入必须经过运行时校验；建议使用 `zod`，只放在边界层。
- 禁止在业务层扩散 `any`、`as unknown as`。
- 时间统一保存为 UTC epoch/ISO，显示时才转换时区。
- ID 使用 branded type 或明确别名，降低 messageId/itemId/pairId 混用。

### 3.4 包管理与代码质量

| 能力 | 选择 |
|---|---|
| 包管理 | pnpm；单 App 也使用 lockfile 严格锁定 |
| 格式化 | Prettier |
| 静态检查 | ESLint + TypeScript ESLint + React Hooks rules |
| 提交检查 | lint-staged；不建议一开始加入复杂 Git hook 框架 |
| 配置 | `app.config.ts`，区分 development / preview / production |
| 依赖健康 | 每次升级运行 Expo Doctor 并核对 New Architecture 兼容性 |

---

## 4. 路由与导航

### 4.1 选择 Expo Router

**选择：Expo Router + Native Stack / 原生 Modal。**

Expo Router 提供基于文件的路由、深链和原生导航组件。SDK 56 起，业务代码应使用 `expo-router` 对应入口，不再混用外部 `@react-navigation/*` 导入。[Expo Router](https://docs.expo.dev/versions/v56.0.0/sdk/router/)

建议路由：

```text
app/
├── _layout.tsx
├── (auth)/
│   ├── create-identity.tsx
│   ├── pair.tsx
│   └── verify-safety-number.tsx
├── (main)/
│   ├── _layout.tsx              # Chat / Space / Settings
│   ├── chat/
│   │   ├── index.tsx
│   │   └── message/[id].tsx
│   ├── space/
│   │   ├── index.tsx
│   │   ├── activity.tsx
│   │   ├── search.tsx
│   │   └── item/[id].tsx
│   └── settings/
│       ├── index.tsx
│       ├── devices.tsx
│       └── privacy.tsx
└── +not-found.tsx
```

### 4.2 导航动画规则

- 普通 Push/Pop：使用 Native Stack 默认平台转场。
- 创建/编辑 Shared Item：使用原生 modal/form sheet。
- “保存到 Space”选择器：底部 sheet。
- Chat → Item 来源跳转：标准页面转场，不做全局 Hero 过度动画。
- 只有品牌级关键路径才做 shared transition；先验证稳定性、可访问性和列表回收影响。

原生栈的页面动画和手势由平台处理，通常更顺滑，也更符合系统预期；代价是自定义范围受平台能力约束。[React Navigation Native Stack](https://reactnavigation.org/docs/native-stack-navigator/)

---

## 5. 动画与手势方案

### 5.1 动画分层

| 层级 | 工具 | 适用场景 | 不适用场景 |
|---|---|---|---|
| L0 页面转场 | Native Stack / 原生 Modal | Push/Pop、设置页、详情页、表单 | 任意像素级自定义转场 |
| L1 组件状态 | Reanimated | 卡片插入、折叠、进度、选中、布局变化 | 网络和数据库逻辑 |
| L2 手势交互 | Gesture Handler + Reanimated | 长按、多选、拖拽、Swipe、Sheet | 用 JS state 每帧驱动 |
| L3 Canvas 视觉 | React Native Skia | 粒子、光晕、路径、焚毁效果、品牌背景 | 消息正文、表单、无障碍关键内容 |
| L4 设计资产 | Rive 或 Lottie | Onboarding、空状态、品牌反馈 | 承载业务状态真相 |

### 5.2 主选：Reanimated + Gesture Handler

Reanimated worklet 可以在 UI Runtime 计算动画样式，Gesture Handler 使用平台原生手势系统并与 Reanimated 联动，适合 M2Y 的手势密集交互。[Reanimated Worklets](https://docs.swmansion.com/react-native-reanimated/docs/guides/worklets/)、[Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/)

规则：

- 位移、缩放、透明度、圆角、颜色等高频属性由 SharedValue 驱动。
- 手势 `onUpdate` 不调用网络、数据库、加密和复杂业务函数。
- 手势结束后只把最终意图调度回 RN Runtime，例如 `archiveItem(id)`。
- 不把完整 Theme、Item、Message 对象捕获进 worklet；提前提取原始数字/颜色。
- 优先动画 `transform` 和 `opacity`，克制逐帧修改布局属性。
- 持续动画在屏幕失焦、App 进入后台或 Reduce Motion 开启时停止。
- 开发模式看到的 FPS 不作为结论，必须在 release/profile build 与真机测量。

### 5.3 Skia 使用边界

Skia 与 Reanimated SharedValue 可以直接协同并在 UI 线程驱动绘制。[Skia Animations](https://shopify.github.io/react-native-skia/docs/animations/animations/)

建议使用：

- M2Y-ID 生成时的轻量身份图形。
- 焚毁模式的背景/边缘效果。
- Agreement 双方确认完成的路径动画。
- Space 空状态或连接状态的抽象背景。

禁止使用：

- 用 Canvas 重写消息列表、文字编辑器、按钮或表单。
- 在 Skia Canvas 中放必须被屏幕阅读器识别的唯一信息。
- 多个全屏 Canvas 常驻并持续刷新。
- 为普通 Loading 引入复杂 GPU 动画。

### 5.4 Rive 与 Lottie

**默认不安装，按设计资源决定二选一。**

| 条件 | 选择 |
|---|---|
| 需要状态机、拖拽/点击互动、一个资产响应多种状态 | Rive |
| 设计师已有 AE 导出的固定时间轴 JSON | Lottie |
| 只是按钮、卡片、列表变化 | 都不选，使用 Reanimated |
| 粒子、动态路径、程序生成视觉 | Skia |

Rive 新 React Native runtime 基于 Nitro Modules，支持 RN 0.78+/Expo SDK 53+，在 Expo 中需要 Development Build。[Rive Migration Guide](https://rive.app/docs/runtimes/react-native/migration-guide)、[Rive with Expo](https://rive.app/docs/runtimes/react-native/adding-rive-to-expo)

一旦选择 Rive：

- 动画资产入仓或走受控 CDN，并有 hash/version。
- 状态机输入名形成设计—开发契约。
- 资产加载失败时有静态 fallback。
- 不让 Rive state machine 决定业务状态；它只消费业务结果。

### 5.5 Bottom Sheet

SDK 56 的 `@expo/ui` 已提供原生 Universal BottomSheet，并有兼容 `@gorhom/bottom-sheet` API 的替代层；原生实现的自定义背景、动画值和任意 snap point 在 Android 上受平台限制。[Expo UI BottomSheet](https://docs.expo.dev/versions/v56.0.0/sdk/ui/universal/bottomsheet/)、[Drop-in BottomSheet](https://docs.expo.dev/versions/v56.0.0/sdk/ui/drop-in-replacements/bottomsheet/)

决策：

- 普通“保存到 Space”、日期选择、确认操作：优先 `@expo/ui` 原生 BottomSheet。
- 若原型明确要求 inline peek、自定义背景、手势联动或任意 animated position，再使用 `@gorhom/bottom-sheet`。
- 不同时在同一流程混用两套 Sheet 心智。

### 5.6 动效设计规范

建议建立 tokens：

```ts
export const motion = {
  duration: {
    instant: 90,
    fast: 160,
    normal: 240,
    slow: 360,
  },
  spring: {
    responsive: { damping: 24, stiffness: 260, mass: 0.8 },
    gentle: { damping: 26, stiffness: 180, mass: 1 },
  },
};
```

数值需由设计与真机调试确定，不能把示例直接当最终规范。

交互原则：

- 同一个状态变化只保留一个视觉主动作。
- 内容密集页使用短、低位移、低振幅动画。
- 动画不能延迟输入、发送、解锁、确认和危险操作反馈。
- 支持系统 Reduce Motion；禁用后仍能理解状态。
- 为自动化测试提供 motion scale 0 或测试模式，避免无限动画阻塞 E2E。

---

## 6. 样式、组件与设计系统

### 6.1 选择 StyleSheet + Design Tokens

**不建议 MVP 使用 NativeWind/Tailwind，也不建议引入大型跨平台 UI Kit。**

理由：

- M2Y 视觉与动画定制较多，大型 UI Kit 往往需要覆盖其内部样式和动效。
- RN 没有 DOM、CSS cascade 和普通 Web layout；过早使用类名会掩盖需要掌握的 RN 布局模型。
- StyleSheet 与 Reanimated AnimatedStyle 的边界更直接。
- Expo SDK 56 的 `@expo/ui` 可在日期、原生菜单、Sheet 等局部提供原生能力，不必把整套 UI 都迁入 SwiftUI/Compose。

结构：

```text
src/design/
├── tokens/
│   ├── color.ts
│   ├── spacing.ts
│   ├── radius.ts
│   ├── typography.ts
│   └── motion.ts
├── primitives/
│   ├── AppText.tsx
│   ├── Surface.tsx
│   ├── IconButton.tsx
│   └── PressableScale.tsx
└── patterns/
    ├── ItemCard.tsx
    ├── EmptyState.tsx
    └── StatusPill.tsx
```

### 6.2 图标、图片和触觉反馈

- 图标使用 SVG 组件或 `@expo/vector-icons` 中明确的一套，不混用多个图标风格。
- 图片使用 Expo Image；缩略图、占位与解密文件 URI 通过 Asset Repository 管理。
- 触觉反馈使用 `expo-haptics`，仅用于确认、完成、危险操作和模式切换。
- 触觉是反馈增强，不代替视觉和无障碍状态。

### 6.3 无障碍

- 每个可操作 Animated View 都有可访问角色、标签和状态。
- Gesture-only 动作必须有按钮/菜单替代入口。
- Skia/Rive 视觉提供语义等价的 RN 文本或 accessibility label。
- 动态字体下测试消息气泡、Sheet、Task/Agreement 状态卡片。
- 颜色变化之外必须有文字或图标。

---

## 7. 聊天、列表与键盘

### 7.1 选择 FlashList v2

Chat 与 Activity 使用 FlashList v2；普通短设置列表可用 ScrollView/FlatList。

FlashList 的性能优势来自 cell recycling。异构消息应使用 `getItemType` 建立不同回收池，cell 树不应添加随数据变化的动态 `key`；性能只能在 release 模式判断。[FlashList Performance](https://shopify.github.io/flash-list/docs/fundamentals/performance/)、[FlashList Usage](https://shopify.github.io/flash-list/docs/usage/)

消息列表建议：

```tsx
<FlashList
  data={messages}
  keyExtractor={(item) => item.id}
  getItemType={(item) => item.type}
  maintainVisibleContentPosition={{
    startRenderingFromBottom: true,
    autoscrollToBottomThreshold: 0.2,
  }}
  renderItem={renderMessage}
/>
```

实现规则：

- 消息行按 `text/image/file/system/item-card` 分 cell 类型。
- Cell 不直接订阅整个全局 Store；只读取自身必要数据。
- 图片解密/尺寸变化不能让当前阅读位置跳动。
- 顶部补页必须保持可见位置。
- “新消息”悬浮按钮由滚动位置派生，不能每帧 setState。
- 单条插入/删除可以做布局动画；批量同步、首次解密和分页不逐条动画。
- 1 万条混合消息是真机基准，不以 20 条 Demo 作为性能结论。

### 7.2 键盘

聊天 App 的键盘体验比多数页面动画更重要。

建议使用 `react-native-keyboard-controller`，提供跨平台键盘帧事件、Reanimated SharedValue、Android 交互式键盘与动态输入模式。它依赖 Reanimated，且应与 Reanimated `useAnimatedKeyboard` 二选一，避免冲突。[Keyboard Controller](https://kirillzyusko.github.io/react-native-keyboard-controller/docs/recipes/architecture)

必须测试：

- iOS 交互下拉键盘。
- Android edge-to-edge 与 `adjustResize`。
- 输入框多行增高。
- 回复/Item discussion banner 出现时的布局。
- 图片选择器和 Sheet 返回后焦点恢复。
- 语音输入法、第三方输入法、中文联想与 emoji 键盘。

### 7.3 富文本笔记

富文本编辑在 RN 中没有公认的一站式方案；Expo 官方也明确指出需要在原生复杂度和基于 Web/DOM 的编辑器之间权衡。[Expo Rich Text Guide](https://docs.expo.dev/guides/editing-richtext/)

P0 建议：

- 首版使用普通 `TextInput` + 结构化工具栏，支持标题、段落、列表、清单、加粗和链接的有限 AST。
- 不引入 WebView/DOM 富文本作为核心依赖。
- 不在 P0 追求 Markdown 所见即所得、嵌套表格和复杂 selection。
- 先做输入法、selection、撤销、粘贴和大文本性能 Spike，再决定是否采用社区 native editor。

理由：保护 P0 范围，符合 PRD 中“弱化 Markdown/CRDT”的方向。

---

## 8. 状态管理与本地数据

### 8.1 三类状态必须分开

| 状态类型 | 示例 | 存放位置 |
|---|---|---|
| 持久业务数据 | Message、Shared Item、Activity、outbox | SQLCipher SQLite |
| 短期 UI 状态 | 当前多选、Sheet、锁定、筛选草稿、连接提示 | Zustand / local state |
| 动画状态 | drag progress、opacity、sheet progress | Reanimated SharedValue |

错误示例：

- 把全部消息复制到 Zustand。
- 用 TanStack Query cache 当离线数据库。
- 把 SharedValue 当业务状态，手势结束后没有持久化结果。
- SQLite、Zustand、Query cache 各有一份可编辑 Item。

### 8.2 Zustand 使用边界

Zustand API 轻量，接近 Pinia 的 store 使用感，适合 Vue 开发者过渡。[Zustand Introduction](https://zustand.docs.pmnd.rs/)

建议 store：

```text
useSessionStore     是否锁定、当前身份、启动阶段
useComposerStore    回复目标、讨论 Item、附件草稿
useSelectionStore   消息多选与批量操作模式
useOverlayStore     Sheet / Modal / Toast 编排
useSyncUiStore      在线、同步中、错误摘要
```

限制：

- 不使用 `persist` 保存敏感状态。
- 不在一个巨型 Store 中放所有字段。
- 组件通过 selector 订阅最小切片。
- 可推导值不重复存储。
- Zustand action 可以调用 use case，但 Store 本身不直接拼 SQL。

### 8.3 SQLite + SQLCipher + FTS5

Expo SQLite 支持持久数据库、FTS 与 SQLCipher 配置；SQLCipher 需要 Development Build/CNG，不能在 Expo Go 中验证。[Expo SQLite](https://docs.expo.dev/versions/v56.0.0/sdk/sqlite/)

配置方向：

```ts
// app.config.ts（示意）
plugins: [
  [
    'expo-sqlite',
    {
      enableFTS: true,
      useSQLCipher: true,
    },
  ],
];
```

数据库职责：

- 消息与消息状态。
- Shared Item 及类型负载。
- 来源关系和讨论关系。
- Activity。
- 本地 FTS 索引。
- Outbox、Inbox 和 sync cursor。
- 文件元数据与本地缓存索引。
- schema migrations。

### 8.4 为什么首版不引入 ORM

首版建议显式 SQL + typed repository：

- 数据表数量有限但同步事务复杂。
- Outbox、FTS、游标、幂等和批量 apply 需要清楚控制 SQL。
- 用户还在学习 React/RN，不应同时学习一个 ORM 的 DSL、migration 与运行时限制。
- 参数化 SQL 便于安全审查和性能分析。

当 schema 稳定、团队扩大且迁移工作明显重复时，再评估 Drizzle。Expo SQLite 官方列出了 Drizzle 集成，但不是必须层。[Expo SQLite Integrations](https://docs.expo.dev/versions/v56.0.0/sdk/sqlite/)

### 8.5 数据库结构建议

```text
messages
shared_items
shared_item_sources
shared_item_discussions
activities
operations_outbox
operations_inbox
sync_cursors
assets
note_versions
agreement_confirmations
search_documents (FTS5)
schema_migrations
```

约束：

- `operation_id` 全局幂等。
- Agreement confirmation 使用 `(agreement_id, version, user_id)` 唯一键。
- Task waiting 状态与 `waiting_for` 由 CHECK/应用校验共同保证。
- FTS 只索引常规消息和未删除/未锁定的本地明文视图。
- 焚毁消息销毁、账户锁定或退出时清理临时解密缓存和索引。

### 8.6 数据库密钥

- 随机生成数据库密钥；不硬编码、不进 `.env`、不进 JS bundle。
- SecureStore 只保存小型包装密钥/数据库密钥材料，消息正文与大 JSON 不进入 SecureStore。官方说明底层平台可能拒绝过大的值。[Expo SecureStore](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/)
- 应用解锁后才把必要密钥释放到短生命周期内存。
- 进入后台按威胁模型清理 JS 层引用；数据库连接策略需在真机验证启动性能。
- 换机/恢复是独立安全协议，不能简单把数据库密钥上传服务端。

---

## 9. 同步与网络

### 9.1 不使用 TanStack Query 作为核心同步引擎

TanStack Query 适合服务端状态的请求缓存、重试和失效；M2Y 的核心是本地业务事务、密文 operation、跨设备 cursor、幂等与冲突规则。其缓存不能替代 SQLite/outbox。[TanStack Query](https://tanstack.com/query/v5)

可选使用范围：

- 公共配置、版本检查、帮助内容、订阅/配额等非 E2EE HTTP 数据。
- 不持久化任何聊天或 Shared Item 明文到 Query cache。

### 9.2 Sync Engine

组件：

```text
OperationBuilder
OutboxRepository
EnvelopeCryptoPort
UploadTransport
CursorPullTransport
InboxApplier
ConflictResolver
RetryScheduler
ConnectionObserver
```

操作格式：

```ts
type Operation = {
  operationId: string;
  pairId: string;
  actorDeviceId: string;
  entityType: 'message' | 'shared_item' | 'activity' | 'asset';
  entityId: string;
  baseVersion?: number;
  action: string;
  payload: unknown;
  clientCreatedAt: number;
};
```

该 Operation 在客户端业务层可见；离开设备前整体加密成服务端不可读的 Envelope。

### 9.3 同步协议

- HTTP 上传 operation envelope，服务端按 `operationId` 幂等。
- HTTP `sync?cursor=...` 可靠拉取；cursor 由服务端密文队列顺序生成。
- WebSocket 仅发送“不透明 pair/device 有新 envelope”信号。
- 客户端收到 socket 信号、App 回前台、网络恢复、推送唤醒时执行 pull。
- ack 与 cursor 推进在本地 apply 成功后提交。
- 服务端至少一次投递，客户端幂等；不要追求不可证明的“恰好一次”。

### 9.4 冲突策略

| 对象 | 策略 |
|---|---|
| Message | 追加为主；撤回/销毁是带版本的状态操作 |
| Task 结构化字段 | 基于版本检测；非冲突字段可合并，冲突展示最终状态及 Activity |
| Note | 并发版本保留冲突副本，禁止静默 LWW 丢文本 |
| Agreement | 确认绑定内容版本；正文变化使新版本重新等待确认 |
| Pin/置顶 | 可接受基于操作顺序收敛，但保留操作者 Activity |
| Delete | Tombstone + 保留期；防止离线旧操作复活对象 |

### 9.5 网络库

- 普通 HTTP 使用平台 `fetch`，在 `transport` 层统一 timeout、认证、retry 和错误映射。
- WebSocket 优先原生 `WebSocket` + 小型封装；不因 NestJS 默认能力直接引入 Socket.IO。
- 若需求确认需要 rooms、ack 与自动重连协议且团队接受额外开销，再评估 Socket.IO。
- 网络状态使用 `@react-native-community/netinfo`，但“有网络”不等于后端可达。

---

## 10. 文件与媒体

### 10.1 文件方案

| 能力 | 选择 |
|---|---|
| 文件选择 | `expo-document-picker` |
| 图片选择 | `expo-image-picker` |
| 本地文件 | `expo-file-system` |
| 图片展示/缓存 | `expo-image` |
| 系统分享 | `expo-sharing`，明文临时文件需清理 |
| 服务端资产 | S3 兼容对象存储，仅密文 |

### 10.2 加密上传要求

- 附件生成独立随机内容密钥。
- 使用流式/分块加密，避免将 100MB 文件一次性读取为 Base64/Uint8Array 进入 JS 内存。
- JS 只编排任务与进度；大文件加密应在原生模块/受控流式实现中执行。
- 分片具有序号、认证信息、幂等上传 ID 和最终 manifest。
- 文件名、MIME、描述等敏感元数据放入加密 manifest；服务端只保留运行所需大小/对象 ID。
- 下载到 App 沙盒后按需解密；分享给外部 App 前二次确认并清理临时明文。
- 同一 Chat File 与 Space File Item 引用同一 `assetId`，不重复上传。

### 10.3 缓存

- 密文缓存与临时明文目录分开。
- 临时明文采用随机文件名，不使用原文件名作为路径。
- App 锁定、退出、分享结束和崩溃恢复时运行清理任务。
- iOS/Android 系统备份排除敏感数据库和临时目录。
- 低存储空间时可删除可重新下载的密文缓存，但不自动删除未同步 outbox。

---

## 11. 安全与 E2EE 边界

### 11.1 原则

- React Native 负责 UI、业务编排与本地模型，不负责发明密码学协议。
- JavaScript 不能保存长期私钥或自行实现 Double Ratchet。
- 密钥生成、会话状态、加解密和安全擦除通过经过审计的原生层完成。
- 服务端仅存密文 envelope 和密文资产，不持有内容解密密钥。

### 11.2 libsignal 技术验证

Signal 官方 `libsignal` 底层为 Rust，并暴露 Java、Swift 和 TypeScript API；React Native 项目仍需解决 Android/iOS binding、会话存储、多设备、升级和打包问题。[libsignal](https://github.com/signalapp/libsignal)

M0 必须完成独立 Spike：

1. 在 iOS/Android Development Build 中初始化身份。
2. 双端建立会话并交换加密消息。
3. 进程重启后恢复会话。
4. 模拟 out-of-order、duplicate、offline 和密钥变化。
5. 测量 1,000 条消息与 100MB 附件密钥封装性能。
6. 验证 Keychain/Keystore 生命周期、换机和设备撤销。
7. 完成许可证、维护承诺与安全评审。

实现路径：

- Swift/Kotlin SDK 封装：优先 Expo Modules API，适合现代 Swift/Kotlin 与 New Architecture。[Expo Modules API](https://docs.expo.dev/modules/overview/)
- 如必须直接接 C++/Rust JSI：构建独立 TurboModule/原生包，不把复杂 C++ 塞进业务 App 目录。

在 Spike 与安全评审通过前，PRD 中的 E2EE 只能称“待实现安全目标”，不能对外声称 Signal Protocol 已正确实现。

### 11.3 本地访问控制

- `expo-local-authentication` 调用 Face ID/Touch ID/Android Biometrics；Face ID 必须在 Development Build/真实设备验证。[Expo Local Authentication](https://docs.expo.dev/versions/v54.0.0/sdk/local-authentication/)
- 生物识别只负责放行，不直接作为数据库密钥。
- PIN 使用内存硬化 KDF 的最终参数需由安全设计确定；不保存可逆 PIN。
- 失败次数、降级到系统密码、恢复材料与诱饵 PIN 分开建模。

### 11.4 屏幕保护

`expo-screen-capture` 可以按平台阻止捕获/录屏并监听截图，但能力存在 OS 差异。Android 13 以下截图回调可能要求不适合本产品的广泛媒体权限；不应为告警牺牲权限最小化。[Expo ScreenCapture](https://docs.expo.dev/versions/latest/sdk/screen-capture/)

策略：

- 焚毁/密钥/恢复码页面启用最强可用保护。
- iOS 录屏/投屏检测后遮罩；截图告警不宣传为“阻止截图”。
- Android 低版本若监听要求宽泛照片权限，放弃监听，只启用可行的屏幕阻止。
- App 进入后台立即显示隐私遮罩。
- 水印与告警为威慑和感知，不是内容防泄漏保证。

### 11.5 日志与错误监控

- 任何 logger 不接受 Message/SharedItem 对象。
- 建立 redaction 层，只记录 operation type、随机 request ID、错误码与粗粒度耗时。
- 崩溃报告禁止附加页面文本、数据库、屏幕截图和文件名。
- Source map 上传到受控错误平台；访问有最小权限与审计。
- Debug build 的网络/数据库查看器不得连接生产账户。

---

## 12. 通知与后台任务

### 12.1 通知

使用 `expo-notifications` 获取 APNs/FCM token、接收数据推送和调度本地提醒。远程推送在 Android Expo Go 中不可用，必须使用 Development Build。[Expo Notifications](https://docs.expo.dev/versions/v56.0.0/sdk/notifications/)

隐私策略：

- 远程 payload 只含随机 wake-up ID、类型 hint 和路由所需不透明字段。
- 默认通知显示“M2Y 有一项更新”，不含发送者昵称、消息、Item 标题或文件名。
- 用户开启内容预览后，由设备本地解密并按系统能力展示；不把明文发给推送服务。
- Android 建立 message、action、security 三个克制的 channel。
- Critical/time-sensitive 通知不作为 MVP 默认能力。

### 12.2 本地提醒

- Task/Agreement reminder 在本机调度。
- Item 日期变化时取消旧通知并创建新通知，保存通知 ID。
- 多设备 P1 需处理每台设备重复提醒与时区变化。
- 系统可能延迟后台任务，不能把后台执行当可靠同步机制。

### 12.3 后台同步

- Push 唤醒是优化，不是唯一可靠性来源。
- App 前台、网络恢复、手动刷新都会触发 cursor pull。
- 大文件上传使用平台允许的后台传输能力，需原生 Spike；P0 不承诺任意状态下无限后台上传。

---

## 13. 服务端选型

### 13.1 技术栈

| 层 | 选择 | 理由 |
|---|---|---|
| 语言 | TypeScript | 与客户端共享类型生成和开发经验，不共享业务明文模型 |
| 框架 | NestJS + Fastify Adapter | 模块化、DI、Guard、WebSocket；Fastify 降低 HTTP 开销 |
| 数据库 | PostgreSQL | 强事务、唯一约束、游标、设备与 envelope 元数据 |
| 临时状态 | Redis | 速率限制、连接映射、短期 presence、异步任务；不存内容明文 |
| 资产 | S3 兼容对象存储 | 密文附件、分片上传、生命周期策略 |
| 实时 | 原生 WebSocket (`ws`) | 只做 wake-up，协议简单；暂不引入 Socket.IO |
| API | REST/HTTP | 上传 envelope、cursor sync、设备与资产控制 |
| 部署 | 容器 + 托管 PostgreSQL/Redis/Object Storage | MVP 优先可靠性和备份，不自建所有基础设施 |

NestJS Gateway 原生支持 `ws` 与 Socket.IO 适配器；M2Y 的 socket 只做轻量 wake-up，优先 `ws`。[NestJS Gateways](https://docs.nestjs.com/websockets/gateways)

### 13.2 服务端知道什么

允许：

- 不透明 user/device/pair routing ID。
- 公钥、设备能力和撤销状态。
- envelope ID、密文、发送设备、目标设备、cursor、时间、大小。
- 密文 asset ID、分片、大小与生命周期。
- 推送 token、投递/ack 状态、速率限制数据。

禁止：

- 消息正文、Shared Item 内容、标题、文件名、搜索词。
- Task/Agreement 的业务状态明文。
- 用户关系的营销画像和推荐标签。
- 任意内容级日志、分析或 AI 处理。

### 13.3 服务端模块

```text
IdentityModule
PairingModule
DeviceModule
EnvelopeModule
SyncModule
RealtimeModule
AssetModule
PushModule
AbuseProtectionModule
DeletionModule
AuditModule（只审计基础设施动作，不含内容）
```

### 13.4 数据表

```text
identities
devices
pairs
pair_members
envelopes
envelope_recipients
sync_cursors / delivery_acks
assets
asset_parts
push_tokens
pairing_requests
rate_limit_events
deletion_jobs
```

PostgreSQL RLS 可以作为纵深防御，但服务账户和 owner 可能绕过策略，不能把 RLS 当唯一授权层；所有 API 仍须显式检查 pair/device membership。[PostgreSQL Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

### 13.5 Redis 使用边界

MVP 使用：

- WebSocket connection registry。
- Pair/device 速率限制。
- 短期在线状态，秒/分钟级 TTL。
- Push/删除等异步作业的队列或锁。

不使用：

- 把 Redis 当消息持久数据库。
- 无限保留 presence/IP 记录。
- 在 Redis 中放解密后的 payload。

若后续使用 Redis Streams，consumer group 能追踪 pending、ack 与 lag，但 Postgres 中的 envelope 仍是可靠投递事实源。[Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/)

### 13.6 后端不应与客户端共享什么

可共享：

- OpenAPI 生成的 transport DTO。
- 不透明 Envelope/Device/Asset 协议类型。
- Error code 与版本常量。

不共享：

- 客户端解密后的 Message/SharedItem 完整业务类型。
- 数据库实体类。
- 加密密钥、测试账号明文或生产配置。

---

## 14. 测试策略

### 14.1 测试金字塔

| 层 | 工具 | 重点 |
|---|---|---|
| 静态 | TypeScript + ESLint | 类型、Hook、边界依赖 |
| 单元 | Jest | 状态机、冲突规则、operation、migration |
| 组件 | React Native Testing Library | 用户交互、无障碍、空/错/加载状态 |
| 数据集成 | Jest + SQLite test DB | transaction、outbox、FTS、migration、幂等 |
| 原生集成 | iOS/Android test target | E2EE、SecureStore、文件流、screen capture |
| E2E | 技术 Spike 后决定 Detox/Maestro | 配对、Chat ↔ Space、离线同步、解锁 |
| 性能 | Release/Profile 真机 | FPS、内存、列表、动画、启动、数据库 |
| 安全 | 威胁建模 + 渗透/取证测试 | 明文残留、日志、密钥、越权、删除 |

React Native 官方建议使用 Jest/RNTL 进行 JS 层测试，并用设备级 E2E 验证真实流程。[React Native Testing](https://reactnative.dev/docs/0.78/testing-overview)

### 14.2 E2E 工具决策延后

Detox 对 React Native 有深度同步能力，但其当前官方兼容表明确充分支持到 RN 0.84，RN 0.85+ 尚未充分验证；Expo 集成也由社区主导。[Detox Environment](https://wix.github.io/Detox/docs/introduction/environment-setup/)

M0 用一周内完成对比：

- Detox：验证 RN 0.85、Expo Router、Reanimated 无限动画、SQLCipher、推送启动。
- Maestro：验证关键黑盒流程、CI 设备运行与维护成本。
- 不能两套都全量维护；选一套主 E2E，另一套最多用于少量冒烟。

### 14.3 必测流程

- 配对与安全号码。
- 常规消息发送、离线发送、重试与重复 envelope。
- 长按/多选 → Save to Space → 回到来源消息。
- Task Waiting 双端切换。
- Agreement 同版本确认、离线版本冲突。
- 文件上传中断、续传、删除影响。
- 焚毁消息不可保存，销毁后不在数据库/FTS/缓存。
- App 锁定、后台遮罩、生物识别失败。
- cursor 丢失、socket 丢包、App 被杀后恢复。

### 14.4 动画性能门槛

- 目标设备分三档：近两年旗舰、中档 Android、最低支持设备。
- 高刷设备目标保持 120Hz 可感知流畅；最低设备至少稳定接近屏幕刷新率。
- 测试聊天滚动同时进行图片解密、同步 apply 和键盘动画。
- 每个复杂动画都有 Reduce Motion 与低性能 fallback。
- 禁止仅用模拟器或 Debug build 验收 FPS。

---

## 15. 构建、发布与环境

### 15.1 EAS Profiles

```text
development  Development Build；本地/内部设备；Debug 工具
preview      内部分发/商店测试轨；生产相近配置；测试 OTA
production   商店签名；最少日志；生产 API；受控 OTA
```

EAS Build、Submit、Update 可以组成移动端 CI/CD；Development Build 支持团队与测试者分发。[EAS Tutorial](https://docs.expo.dev/tutorial/eas/introduction/)

### 15.2 OTA 更新策略

- OTA 仅更新 JS 与资源，任何原生依赖/config 变化都必须发新 binary。
- `runtimeVersion` 使用 `appVersion` policy；每次原生版本发布提升 app version。
- preview 与 production 使用独立 channel。
- 同一 commit 的 preview 更新验证后再 promote/republish 到 production。
- 先 5% rollout，观察 crash/install failure，再扩大。
- 生产 OTA 必须启用端到端 code signing；若当前 EAS 套餐或密钥运维不满足，则关闭生产 OTA，走商店发布。
- OTA 签名私钥保存在 KMS/受控 secrets，不进入仓库和开发机普通目录。

EAS Update 通过 runtime version 保证更新与原生 runtime 兼容，也支持分批发布；代码签名让客户端验证更新未被 CDN、云服务或 EAS 篡改。[Runtime Versions](https://docs.expo.dev/eas-update/runtime-versions/)、[EAS Update Code Signing](https://docs.expo.dev/eas-update/code-signing/)

### 15.3 配置与密钥

- App bundle 中的 API URL、public key 不是秘密；真正秘密不放客户端环境变量。
- dev/preview/prod 使用不同 bundle ID/applicationId、数据库、推送凭据和后端环境。
- E2EE 测试密钥与生产信任根完全分离。
- 禁止生产数据进入 preview/debug。
- 生成版本保留 SBOM、lockfile、native fingerprint、commit SHA 和签名信息。

### 15.4 CI 门禁

每个 PR：

```text
format check
typecheck
lint
unit/component tests
SQLite migrations test
expo doctor
prebuild clean verification
```

主分支/候选版本：

```text
iOS + Android preview build
E2E smoke
release-mode animation/list benchmark
dependency/license scan
security tests
signed artifact / SBOM
```

---

## 16. 代码目录与模块边界

```text
app/                              # Expo Router：只做路由组装

src/
├── app/
│   ├── AppProviders.tsx
│   ├── bootstrap.ts
│   └── lifecycle.ts
│
├── features/
│   ├── identity/
│   ├── pairing/
│   ├── chat/
│   ├── save-to-space/
│   ├── space-home/
│   ├── shared-item/
│   ├── activity/
│   ├── search/
│   ├── settings/
│   └── privacy/
│
├── domain/
│   ├── message/
│   ├── shared-item/
│   ├── operation/
│   └── sync/
│
├── data/
│   ├── db/
│   │   ├── migrations/
│   │   ├── schema/
│   │   └── database.ts
│   ├── repositories/
│   ├── search/
│   └── assets/
│
├── sync/
│   ├── outbox/
│   ├── inbox/
│   ├── transport/
│   ├── conflict/
│   └── SyncEngine.ts
│
├── native/
│   ├── crypto/
│   ├── secure-storage/
│   └── screen-protection/
│
├── design/
│   ├── tokens/
│   ├── primitives/
│   ├── patterns/
│   └── motion/
│
├── stores/                       # 只放 UI/session Zustand stores
├── observability/
├── testing/
└── shared/                       # 无业务归属的极少量工具

modules/
└── m2y-crypto/                   # Expo Module/TurboModule，独立测试

server/
├── src/modules/
├── src/infra/
├── migrations/
└── test/
```

依赖规则：

```text
route → feature → application/domain → repository port
data/native/sync → 实现 port
domain 不依赖 React、Expo、SQLite、Zustand
component 不直接 import SQLite 或 crypto module
```

不要创建一个无边界的 `utils/` 或 `services/` 垃圾目录。

---

## 17. Vue 开发者迁移指南

### 17.1 心智映射

| Vue | React / React Native | 差异重点 |
|---|---|---|
| `.vue` SFC | `.tsx` 函数组件 | JSX 是 JavaScript 表达式，不是模板 DSL |
| `props` | props | React props 只读，组件是函数调用心智 |
| `emit` | callback prop | `onSave={() => ...}`，无统一 emit API |
| `ref()` | `useState()` / `useRef()` | state 触发渲染，ref 不触发 |
| `reactive()` | immutable state object | 更新时创建新引用，不直接改原对象 |
| `computed()` | render 派生 / `useMemo()` | `useMemo` 是性能工具，不是默认必需 |
| `watch/watchEffect` | `useEffect` | Effect 用于外部同步，不用于普通派生状态 |
| `onMounted` | `useEffect(..., [])` | 开发 Strict Mode 会额外 setup/cleanup 检查 |
| `v-if` | `condition && <View />` | 使用 JS 条件 |
| `v-for` | `array.map` / FlashList | 长列表不能直接 map 全量渲染 |
| `v-model` | value + onChangeText | 受控输入显式传值与回调 |
| slot | `children` / render prop | 组合用普通 props/函数 |
| Pinia | Zustand | 只对应 UI Store；业务数据在 SQLite |
| Vue Router | Expo Router | 文件路由 + 原生导航栈 |
| scoped CSS | StyleSheet / tokens | 无 DOM、CSS cascade、伪类和普通媒体查询 |
| Transition | Reanimated | 动画值运行在 UI Runtime，可与 React state 分离 |

### 17.2 三个最容易混淆的“响应式值”

```ts
const [count, setCount] = useState(0);
// React 业务/UI 状态：更新触发组件重新渲染

const latestValue = useRef(0);
// 可变引用：更新不触发渲染，常放 handle、timer、最新回调引用

const progress = useSharedValue(0);
// Reanimated UI Runtime 状态：用于逐帧动画，不是业务数据源
```

不要把它们都理解成 Vue `ref`。

### 17.3 Effect 的正确使用

错误：

```tsx
const [fullName, setFullName] = useState('');

useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);
```

正确：

```tsx
const fullName = `${firstName} ${lastName}`;
```

Effect 适合：

- 订阅 AppState、NetInfo、Keyboard、数据库监听。
- 启动/清理 timer、socket、native listener。
- 将 React 状态同步到外部系统。

Effect 不适合：

- 计算展示字段。
- 在多个 state 之间手工同步。
- 代替按钮事件处理。
- 每次 render 都请求数据。

### 17.4 Closure 与旧值

React 回调捕获创建它那次 render 的变量。异步回调、timer、gesture 结束回调若读取“最新值”，需要：

- 正确依赖数组。
- 函数式更新 `setState((prev) => ...)`。
- 必要时用 `useRef` 保存最新引用。
- 不要为消除 lint 警告随意删依赖。

### 17.5 不可变更新

Vue 中常见：

```ts
task.status = 'done';
```

React state 中要写：

```tsx
setTask((prev) => ({ ...prev, status: 'done' }));
```

不过在 M2Y 中，持久 Task 不应靠组件 state 更新，而是：

```tsx
await completeTask(taskId); // use case → SQLite transaction → UI query refresh
```

### 17.6 RN 不是浏览器

- `View/Text/Image/Pressable` 不是 `div/span/img/button`。
- 所有文字必须位于 `Text` 中。
- 默认 Flex 方向是 column。
- 没有 CSS cascade、DOM selector、`position: fixed`、普通 hover。
- ScrollView 会渲染全部 child；长列表使用 FlashList。
- 键盘、Safe Area、状态栏和导航栏是布局的一部分。
- 原生模块变化后必须重建 Development Build，Fast Refresh 不够。

### 17.7 推荐学习顺序（6 周）

#### 第 1 周：React 核心

- JSX、函数组件、props、state、event。
- `useState/useRef/useEffect`。
- closure、immutable update、render 原因。
- 用纯 React 写 Task/Agreement 状态机，不接网络。

#### 第 2 周：React Native 基础

- View/Text/Pressable/TextInput/Image。
- Flexbox、Safe Area、键盘、平台差异。
- Expo Router、Development Build、真机调试。
- 完成 Chat/Space 静态页面和路由。

#### 第 3 周：动画与手势

- SharedValue、animated style、timing/spring/layout transition。
- Tap/LongPress/Pan 与手势竞争关系。
- 实现 Save to Space sheet、消息长按和 Task 状态动画。

#### 第 4 周：列表与数据

- FlashList recycling。
- SQLite migrations、Repository、FTS。
- 实现本地 Chat 与 Space Home，不接后端。

#### 第 5 周：同步与安全

- Outbox/Inbox、cursor、幂等、冲突。
- SecureStore、LocalAuthentication、ScreenCapture。
- 完成断网/重连演示；开始 E2EE Spike。

#### 第 6 周：测试与发布

- Jest/RNTL、设备 E2E、release profiling。
- EAS development/preview build。
- 完成一次从 commit 到 preview 安装的发布演练。

### 17.8 不要一次学完所有 Hooks

第一阶段只需熟练：

```text
useState
useRef
useEffect
useCallback（有明确引用稳定需求时）
useMemo（有测量后的昂贵计算时）
```

再学习：

```text
Expo Router hooks
Zustand selector
Reanimated hooks
Gesture API
Repository live query hook
```

避免“为了性能”给每个变量加 `useMemo/useCallback`；先用 React DevTools/Profiler 找到真实重渲染。

---

## 18. 备选方案与拒绝项

| 决策点 | 主选 | 暂不选 | 原因 |
|---|---|---|---|
| RN 工作流 | Expo Development Build + CNG | Expo Go | 无法覆盖 SQLCipher、E2EE、完整推送、Rive 等 |
| RN 工作流 | Expo + CNG | 纯 RN CLI | 当前团队原生维护成本过高；保留退路 |
| 路由 | Expo Router | 手写 React Navigation 配置 | SDK 56 官方整合、文件路由、深链 |
| 样式 | StyleSheet + Tokens | NativeWind | 先掌握 RN 布局，降低动画抽象层 |
| UI | 自建小型 design system + 局部 Expo UI | 大型 UI Kit | M2Y 定制视觉与动画较多 |
| 动画 | Reanimated + Gesture Handler | RN Animated 作为主栈 | 手势密集、需 UI Runtime |
| 绘制 | 按需 Skia | Skia 重写全 UI | 文本、无障碍、维护成本不合适 |
| 设计动画 | Rive 或 Lottie 二选一 | 同时重度使用 | 控制包体、资产流程和认知成本 |
| 列表 | FlashList v2 | 直接 ScrollView/map | 长聊天必须虚拟化/回收 |
| 持久数据 | SQLCipher SQLite | AsyncStorage/Zustand persist | 查询、事务、FTS、安全能力不足 |
| ORM | 首版显式 SQL/Repository | 立即上 Drizzle | 先控制同步事务，降低学习成本 |
| 核心同步 | 自有 outbox/inbox | TanStack Query cache | 不能表达本地业务事务与 E2EE operation |
| E2EE | 经评审原生实现/绑定 | JS 自研 crypto | 高风险、不可审计、密钥生命周期错误 |
| WebSocket | `ws` wake-up | Socket.IO | 当前协议简单，无需额外层 |
| 富文本 | 受限原生输入 | WebView 大编辑器 | P0 范围与键盘/安全复杂度不匹配 |
| 后端 | NestJS/Fastify | BaaS 直接同步业务表 | E2EE envelope/设备协议需专用边界 |

---

## 19. 技术风险与验证计划

### 19.1 四个必须先做的 Spike

#### Spike A：动画与手势基准（3–5 天）

交付：

- Native Stack + Save to Space Sheet。
- 消息长按、多选、卡片插入与状态切换。
- 一处 Skia 品牌动画。
- Reduce Motion 和 Android 中端机报告。

退出标准：

- 关键交互在目标真机无明显掉帧。
- JS 线程忙时手势仍跟手。
- 动画不破坏 accessibility 与 E2E testID。

#### Spike B：聊天列表与键盘（5–7 天）

交付：

- 10,000 条混合消息。
- 顶部补页、底部定位、图片动态尺寸。
- 中文输入、多行 composer、回复/讨论 banner。
- release build FPS、内存与跳帧报告。

退出标准：

- 当前阅读位置稳定。
- 低端目标机键盘动画和列表滚动可接受。
- Cell recycling 无错图、错状态、局部 state 泄漏。

#### Spike C：SQLCipher + Sync（5–7 天）

交付：

- migrations、FTS、Repository。
- 本地写入 + outbox 同事务。
- mock server cursor sync、重复/乱序/断网注入。
- 焚毁消息数据库/索引清理验证。

退出标准：

- 重启、崩溃、断网不会静默丢操作。
- 重复 envelope 不产生重复实体/Activity。
- 本地数据库与日志无预期外明文。

#### Spike D：E2EE 原生集成（2–3 周）

交付：

- 双平台 libsignal/备选安全实现集成报告。
- 身份、会话、消息、附件密钥、换机/撤销原型。
- 性能、包体、升级、许可证和维护风险。
- 外部安全评审意见。

退出标准：

- 双平台行为一致且有自动测试。
- 密钥不进入普通 JS Store/日志。
- 团队能维护依赖升级；否则调整产品安全承诺或引入专门安全工程能力。

### 19.2 风险表

| 风险 | 等级 | 应对 |
|---|---|---|
| libsignal RN 绑定复杂、维护成本高 | 极高 | M0 独立 Spike + 安全专家；不得边写业务边临时拼接 |
| 动画库/原生库与 RN 升级不兼容 | 高 | Expo SDK 锁版本、Doctor、preview build、季度升级窗口 |
| FlashList recycling 造成 cell 状态串行 | 高 | cell 无 item-local 持久状态，`getItemType`，自动化回归 |
| 键盘与 Sheet/列表冲突 | 高 | Keyboard Controller，真机矩阵，避免多套 keyboard hook |
| SQLCipher/FTS/migration 数据损坏 | 高 | migration fixture、备份恢复测试、事务与 crash injection |
| 富文本范围膨胀 | 高 | P0 受限格式；单独 Spike 后才引入编辑器 |
| Skia/Rive 包体与耗电 | 中 | 按需加载、停止不可见动画、静态 fallback、性能预算 |
| OTA 供应链风险 | 高 | 签名、runtime、preview→rollout；否则关闭生产 OTA |
| 单前端同时承担移动原生与后端 | 高 | 先 Spike、减少库、服务端收敛到密文投递；安全工作不可单人无评审上线 |
| E2E 工具 RN 0.85 兼容性不确定 | 中 | Detox/Maestro Spike 后只选一套主方案 |

---

## 20. 开发里程碑

### M0：技术验证（3–4 周，可并行）

- 完成四个 Spike 中 A/B/C；D 至少得出可行性结论。
- 确定最低 iOS/Android 版本与目标设备矩阵。
- 完成威胁模型、服务端数据清单和日志红线。
- 冻结 Expo SDK、核心原生依赖和升级规则。

### M1：本地原型（4–6 周）

- 配对假数据、Chat、本地 SQLite。
- Space Home、Pin/Task/Note/File/Agreement。
- Save to Space、Waiting、双方确认与 Activity。
- 完整动画/键盘/无障碍基础，不接真实后端。

### M2：密文同步 Alpha（5–7 周）

- 身份、设备、pair、envelope、cursor、asset 服务端。
- E2EE 模块接入。
- outbox/inbox、推送 wake-up、离线/冲突。
- 应用锁、屏幕保护、通知隐私。

### M3：封闭 Beta（4–6 周）

- E2E、性能、崩溃恢复、删除与换机。
- Preview/Production pipeline、签名 OTA 策略。
- 安全审计与修复。
- 根据 WMSP 与用户反馈决定 P1，而非自动加入更多动画或工具。

---

## 21. 立项清单

### 21.1 建仓

```text
[ ] create-expo-app 生成 Expo SDK 56 稳定模板
[ ] pnpm + strict TypeScript + ESLint/Prettier
[ ] Development Build 能在 iOS/Android 真机运行
[ ] app.config.ts + development/preview/production
[ ] Expo Router 路由骨架
[ ] Design tokens 与 motion tokens
[ ] Reanimated/Gesture Handler/Keyboard Controller
[ ] FlashList 基准页
[ ] expo-sqlite SQLCipher/FTS config plugin
[ ] SecureStore/LocalAuthentication/ScreenCapture
[ ] CI：typecheck/lint/test/doctor/prebuild
```

### 21.2 在写正式功能前

```text
[ ] 动画 Spike 通过
[ ] 10k 消息 + 键盘 Spike 通过
[ ] SQLCipher/outbox/sync Spike 通过
[ ] E2EE 原生集成形成评审结论
[ ] Detox/Maestro 主方案确定
[ ] 服务端可见数据清单签字确认
[ ] 日志与崩溃报告 redaction 完成
[ ] 最低系统版本与性能设备确定
```

### 21.3 发布前

```text
[ ] 生产服务端无内容明文与内容型日志
[ ] 数据库/缓存/FTS 的焚毁残留测试通过
[ ] 多端重复/乱序/断网/崩溃注入通过
[ ] Reduce Motion、动态字体、屏幕阅读器通过
[ ] Release 真机性能基准通过
[ ] 安全高危问题为 0
[ ] OTA runtime、签名、rollout 与 rollback 演练通过
[ ] 商店隐私清单与技术事实一致
```

---

## 22. 最终推荐技术栈

### 客户端

| 类别 | 最终建议 |
|---|---|
| 核心 | Expo SDK 56 / RN 0.85 / React 19.2 / TypeScript / Hermes v1 |
| 工作流 | Development Build / CNG / Prebuild / EAS Build |
| 路由 | Expo Router / Native Stack |
| UI | RN primitives + StyleSheet + Design Tokens + 局部 `@expo/ui` |
| 动画 | Reanimated + Gesture Handler |
| 高级视觉 | 按需 Skia；Rive/Lottie 由设计资产二选一 |
| Sheet | 普通场景 `@expo/ui`；强自定义再用 Gorhom |
| 列表 | FlashList v2 |
| 键盘 | react-native-keyboard-controller |
| UI 状态 | Zustand（非持久业务数据） |
| 数据库 | Expo SQLite + SQLCipher + FTS5 |
| 数据访问 | Repository + 显式 migrations/参数化 SQL |
| 同步 | 自有 Outbox/Inbox/Cursor Sync Engine |
| 网络 | fetch + WebSocket + NetInfo |
| 文件 | Expo FileSystem/DocumentPicker/ImagePicker/Image + 原生流式加密 |
| 安全 | SecureStore + LocalAuthentication + ScreenCapture + 原生 E2EE module |
| 通知 | Expo Notifications，密文/不透明 wake-up payload |
| 测试 | Jest + RNTL + SQLite integration + E2E Spike 后定 Detox/Maestro |
| 发布 | EAS Build/Submit；签名 EAS Update 或禁用生产 OTA |

### 服务端

| 类别 | 最终建议 |
|---|---|
| 运行时 | Node.js LTS + TypeScript |
| 框架 | NestJS + Fastify Adapter |
| 实时 | `ws` WebSocket，仅 wake-up |
| 数据库 | PostgreSQL |
| 临时/队列 | Redis |
| 文件 | S3 兼容对象存储，仅密文 |
| 协议 | REST envelope upload + cursor sync |
| 部署 | 容器 + 托管 PG/Redis/Object Storage |
| 可观测性 | 结构化、脱敏日志；无内容 telemetry |

---

## 23. 官方资料

- [Expo SDK 56](https://expo.dev/changelog/sdk-56)
- [React Native Releases](https://reactnative.dev/releases/)
- [Expo New Architecture](https://docs.expo.dev/guides/new-architecture/)
- [Expo Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Expo Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
- [Expo Router](https://docs.expo.dev/versions/v56.0.0/sdk/router/)
- [Reanimated Worklets](https://docs.swmansion.com/react-native-reanimated/docs/guides/worklets/)
- [React Native Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/)
- [React Native Skia Animations](https://shopify.github.io/react-native-skia/docs/animations/animations/)
- [FlashList](https://shopify.github.io/flash-list/docs/usage/)
- [Expo SQLite / SQLCipher / FTS](https://docs.expo.dev/versions/v56.0.0/sdk/sqlite/)
- [Expo SecureStore](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/)
- [Expo Local Authentication](https://docs.expo.dev/versions/v54.0.0/sdk/local-authentication/)
- [Expo ScreenCapture](https://docs.expo.dev/versions/latest/sdk/screen-capture/)
- [Expo Notifications](https://docs.expo.dev/versions/v56.0.0/sdk/notifications/)
- [Expo Modules API](https://docs.expo.dev/modules/overview/)
- [libsignal](https://github.com/signalapp/libsignal)
- [EAS Update Runtime Versions](https://docs.expo.dev/eas-update/runtime-versions/)
- [EAS Update Code Signing](https://docs.expo.dev/eas-update/code-signing/)
- [React Native Testing](https://reactnative.dev/docs/0.78/testing-overview)
- [Detox Compatibility](https://wix.github.io/Detox/docs/introduction/environment-setup/)
- [NestJS WebSocket Gateways](https://docs.nestjs.com/websockets/gateways)
- [PostgreSQL Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/)

---

> **文档结束**  
> 当前技术选型可以直接用于 M0 立项。正式锁定 E2EE 方案、最低系统版本和 E2E 框架前，必须完成第 19 节的技术验证；其中任何一项失败，都应调整范围或实现方案，而不是通过弱化安全与正确性验收绕过。
