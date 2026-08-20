# Figma MVP 基础功能

## Goal

基于 Figma `M2Y` 文件（file key `1GFOX8WVTlTTUzujDtriym`，入口 node `1:2`），把当前 M0 静态客户端骨架推进为一条可操作的本地产品闭环：用户可以在 Chat 中发送本地消息，将消息保存为 Space 共享条目，并在 Space 中筛选、查看、编辑、更新状态和删除条目。

首期价值是验证 M2Y 的核心交互模型与页面信息架构，而不是提前声称身份、配对、端到端加密、持久化或跨设备同步已经完成。

## Background

- 当前应用使用 Expo SDK 56、React Native 0.85、Expo Router 和 TypeScript strict。
- 现有主导航只有 Chat、Space、Settings；三个页面使用静态演示数据。
- `create-identity`、`pair`、`verify-safety-number` 是明确的安全边界占位页。
- SQLite/SQLCipher、同步、原生加密、安全存储和截图保护目前只有依赖或目录边界，没有可宣称完成的业务实现。
- Figma 将约 50 个移动端画面和规格材料扁平化在一个 `2899 x 24972` 超长画板中；大量文字和元素已转换为 Vector/Clip group。画面包含真实页面、弹窗、空态、处理中、成功/失败、安全异常、页面流程图和状态表，不能按“一个画面一个路由”实现。
- 设计归并后的首期核心只有 Chat、Space、Shared Item Detail、Settings 四个页面，以及 Save to Space 和通用确认两类浮层。

## Requirements

### R1 — MVP 导航与视觉基线

- 保留 Chat、Space、Settings 三个底部入口，并按 Figma 对齐主导航、页面背景、标题栏、卡片、标签、按钮、输入区和状态色。
- 新增 Shared Item Detail 详情路由；弹窗、底部浮层、空态、加载态和错误态作为组件状态处理，不建立独立路由。
- 复用并扩展 `src/design/tokens`；不得为每个页面复制颜色、间距、圆角或字体常量。
- 实现前对目标区域分别读取 Figma design context/截图；Figma 导出的真实图标或图片必须落为稳定本地资产，不长期依赖短期 MCP URL。
- 所有可交互控件提供可读的 accessibility label，点击区域和状态表达满足设计稿底部的无障碍约束。

### R2 — 本地 Chat 基础交互

- Chat 展示确定性的本地消息线程，并允许用户输入非空文本后发送一条本地消息。
- 发送成功后清空输入框，新消息立即出现在列表中；纯空白输入不得创建消息。
- 用户可以从消息操作菜单触发“保存到 Space”。首期支持三种保存类型：笔记、待办、约定草稿。
- Chat 中显示保存结果；同一消息以相同类型重复保存时不得静默创建重复条目，应给出可理解反馈或打开已有条目。
- 消息与保存状态只存在当前应用运行会话中，并明确属于功能预览。

### R3 — Save to Space 流程

- Save to Space 使用可复用底部浮层，包含类型选择、可编辑标题和保存操作。
- 标题为必填；待办允许设置首期支持的简单状态，约定以“草稿”或“等待确认的本地预览”表达，不得显示已获得对方确认。
- 新条目保留来源消息 ID，用于 Chat 保存反馈和 Space 详情追溯。
- 保存成功后关闭浮层、更新共享状态，并能在 Space 中立即看到新条目。

### R4 — Space 列表与共享条目详情

- Space 首页显示共享条目列表，并支持全部、笔记、待办、约定三类筛选。
- 列表具有空态；筛选结果为空时提供返回“全部”或继续从 Chat 保存内容的可见动作。
- 点击条目进入统一 Shared Item Detail 页面，而不是为每个类型复制详情页。
- 详情页支持编辑标题/正文或详情、更新允许的本地状态、查看来源标识和删除。
- 删除必须二次确认；确认后列表、筛选结果和 Chat 保存反馈保持一致。
- 首期不实现 File、Activity、Timeline 和全局 Search；现有文件演示条目不得作为可上传/可同步能力继续展示。

### R5 — Settings 与安全表述

- Settings 首页按 Figma 重排为真实可用入口和明确延期入口。
- 保留开发环境的 10K 消息基准入口，但 production 正常导航不暴露该入口。
- 身份、配对、安全号、多设备、恢复码、阅后即焚、通知隐私、数据导出、解绑和删号不得伪装为已完成；如显示入口，必须为不可用说明或延期状态。
- UI、日志、测试 fixture 不得包含真实密钥、token、安全号、生产凭据或敏感明文。

### R6 — 共享状态与架构边界

- 使用一个明确命名的本地预览状态容器，让 Chat 与 Space 共享 Message 和 SharedItem 状态。
- 状态转换由一个可穷举 reducer/command 层统一管理；组件不得分别实现保存、编辑、状态变更和删除规则。
- Domain 保持纯 TypeScript；路由只组合 feature screen；UI 不直接访问 SQLite、crypto 或 sync。
- 不新增全局状态库。React Context + reducer 足以满足首期多个独立消费者的共享状态需求。
- 初始 fixture 必须确定、无敏感数据、易于测试，并与用户运行期创建的数据使用同一领域类型。

### R7 — 通用交互状态与质量

- 覆盖空列表、空筛选结果、非法输入、重复保存、未知条目 ID 和删除确认。
- 只有真实异步操作才显示 loading；内存操作不得添加虚假的长时间同步或加密进度。
- Motion 使用共享 token 并尊重系统 Reduce Motion。
- 所有新增用户文案使用正确 UTF-8 中文，修复本次触达页面中现有的乱码文案。

## Acceptance Criteria

- [x] 启动应用后进入 Chat，底部可在 Chat、Space、Settings 间切换，视觉结构与选定 Figma 页面一致。
- [x] 用户输入非空消息并发送后，消息立即显示且输入框清空；空白消息不会被创建。
- [x] 用户从一条消息打开 Save to Space，选择笔记、待办或约定草稿并填写有效标题后能够保存。
- [x] 保存后的条目无需刷新即可出现在 Space；相同消息和类型的重复保存得到明确反馈且不产生重复数据。
- [x] Space 可以按全部、笔记、待办、约定筛选，并正确显示列表空态和筛选空态。
- [x] 用户可以打开统一详情页，编辑条目、更新允许状态并保存；返回 Space 后内容一致。
- [x] 用户删除条目前必须确认；确认后条目从 Space 消失，并且相关 Chat 保存状态不再声称条目仍存在。
- [x] Settings 只对真实可用能力提供可操作入口，延期的安全/同步能力不会显示为已完成。
- [x] App 重启后预览数据消失是首期预期行为，界面不宣称数据已持久化、加密、同步或获得另一端确认。
- [x] reducer/domain 单元测试覆盖创建、重复保存、编辑、状态更新、删除和未知 ID；组件测试覆盖发送、保存、筛选和删除确认主路径。
- [x] `pnpm format:check`、`pnpm typecheck`、`pnpm lint`、`pnpm deps:check`、`pnpm test --ci`、`pnpm config:check`、`pnpm exec expo-doctor` 和 `pnpm exec expo export --platform android` 全部通过。
- [x] 在目标 Android 尺寸上对 Chat、Save to Space、Space、Shared Item Detail、Settings 和至少一个空态进行截图对比，不存在阻断使用的布局溢出、键盘遮挡或不可点击控件。

## Out of Scope

- 真实本地身份、PIN、恢复码、配对协议、安全号和 E2EE。
- SQLite/SQLCipher schema、重启后持久化、FTS 和 migration。
- 服务端、outbox/inbox、跨设备同步、冲突处理和在线状态。
- 文件选择、上传、下载、分享和加密文件生命周期。
- 双方确认协议、Activity、Timeline、全局 Search 和提醒通知。
- 多设备管理、动态安全号、阅后即焚、截图保护策略、数据导出、解绑、删号和灾难恢复。
- iOS 原生编译、商店发布、EAS 云构建和生产凭据接入。
- 将 Figma 中的流程图、对象状态表、错误状态表和验收映射表生成为 App 页面。

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| 首期用户闭环 | Chat → Save to Space → Space → Shared Item Detail | 这是设计和现有骨架共同支持的最小产品价值链 |
| 数据生命周期 | 仅当前运行会话 | 避免把数据库、密钥生命周期和迁移扩大进视觉/交互 MVP |
| 状态机制 | React Context + reducer | Chat 与 Space 需要共享状态，但尚不需要外部状态库 |
| Shared Item 类型 | 笔记、待办、约定草稿 | 能验证核心模型；File 需要真实资产生命周期，暂缓 |
| 页面建模 | 4 个页面 + 2 类浮层 + 通用状态 | 设计稿的大部分画面是同一页面的状态，不是独立路由 |
| 安全能力 | 明确延期，不伪造 | 项目规范禁止占位密码学和不真实的安全声明 |
| 视觉策略 | 先统一 token/primitive，再逐屏适配 | 减少 Figma 扁平稿导致的页面级硬编码和重复 |

## Risks and Deferred Items

- Figma 原稿被扁平化，无法可靠读取所有文字层、组件名和单屏 frame；实现时需按逻辑区域取得 design context，并以高分辨率截图作视觉依据。
- 当前源文件存在乱码文案；本任务触达页面必须修复，但不扩大为全仓库编码迁移。
- 内存预览无法验证数据恢复、加密或同步，因此首期反馈只能验证信息架构和交互假设。
- 真机安装/启动取决于执行时是否有 Android 设备或模拟器；没有设备时保留为明确待验收项，不能用 export 冒充真机通过。
