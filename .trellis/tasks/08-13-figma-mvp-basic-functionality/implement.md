# Figma MVP 实施计划

执行模式：Codex inline。用户批准本规划摘要后，才运行 `task.py start`。实施前重新加载 `trellis-before-dev`；完成后运行 full-scope `trellis-check`。

## Ordered Checklist

- [x] A. 建立逐屏设计基线
  - 为 Chat、Save to Space、Space、Shared Item Detail、Settings 和空态定位最小可用 Figma 子节点。
  - 分别取得 design context、截图和真实资产；记录视口、颜色、排版、间距、圆角和交互状态。
  - 将短期 MCP 资产下载为稳定本地文件，并建立设计差异检查清单。
  - 检查点：没有把流程图、状态表或同页状态误建为路由。

- [x] B. 收敛 design token 与复用组件
  - 搜索现有 token、`ScreenScaffold`、motion pattern 和列表/输入实现，再决定扩展点。
  - 对齐 Figma 的 canvas/surface/accent/status 色、字号、间距和圆角。
  - 实现首期真正复用的 BottomSheet、ConfirmDialog、EmptyState、StatusBadge/ItemCard。
  - 修复本次触达页面和主导航中的乱码文案；不进行无关全仓库重写。
  - 检查点：相同视觉值不在多个 feature 中重复硬编码，Reduce Motion 仍被尊重。

- [x] C. 定义领域契约与共享预览状态
  - 增加纯 TypeScript Message 契约，收敛 SharedItem 的首期支持类型和状态。
  - 在 `src/stores/preview-workspace/` 创建确定性 fixture、Context、selectors 和穷举 reducer/commands。
  - 实现发送、保存、重复检测、编辑、状态更新、删除及未知 ID 的 typed result。
  - 将 provider 接入现有 `AppProviders`，不初始化 SQLite、crypto 或 sync。
  - 添加 reducer/domain 单元测试。
  - 检查点：Chat 与 Space 读取同一状态源；UI 没有重复实现领域校验。

- [x] D. 实现 Chat 主路径
  - 按 Figma 重构 Chat header、消息列表、气泡、composer 和消息操作菜单。
  - 接入本地消息发送、空白校验、键盘避让和列表定位。
  - 从消息操作打开 Save to Space，不直接在 Chat 组件内创建 SharedItem。
  - 添加发送与菜单行为组件测试。
  - 检查点：消息发送与滚动在 Reduce Motion/键盘场景下可用。

- [x] E. 实现 Save to Space
  - 实现笔记、待办、约定草稿类型选择、标题/详情编辑和保存反馈。
  - 接入 reducer command；覆盖空标题、未知来源消息和重复保存。
  - 保存成功后原子更新 Chat 关联状态与 Space 数据并关闭浮层。
  - 添加保存成功、校验失败和重复保存组件测试。
  - 检查点：界面不使用“已同步”“已加密”“对方已确认”等未实现表述。

- [x] F. 实现 Space 与 Shared Item Detail
  - 按 Figma 实现 Space 列表、全部/笔记/待办/约定筛选和两类空态。
  - 添加 `space/[itemId]` 详情路由和 feature screen。
  - 实现统一详情的编辑、允许状态变更、来源信息和删除确认。
  - 覆盖未知 ID、取消删除和确认删除，确保返回 Space 后状态一致。
  - 添加筛选、编辑和删除主路径组件测试。
  - 检查点：没有为三种类型复制三套详情路由或状态规则。

- [x] G. 收敛 Settings 与安全边界
  - 按 Figma 重排 Settings 首页，只连接当前真实可用的入口。
  - 保留仅开发环境可见的 10K 消息基准入口。
  - 将身份、配对、安全号、同步和隐私高级能力保持为明确延期，不创建假实现。
  - 检查点：production 正常 UI 不暴露开发入口或虚假安全状态。

- [x] H. 验证与视觉回归
  - 运行 `pnpm format:check`。
  - 运行 `pnpm typecheck`。
  - 运行 `pnpm lint`。
  - 运行 `pnpm deps:check`。
  - 运行 `pnpm test --ci`。
  - 运行 `pnpm config:check`。
  - 运行 `pnpm exec expo-doctor`。
  - 运行 `pnpm exec expo export --platform android`。
  - 在可用 Android 设备/模拟器上验证启动、底部导航、Chat 键盘、保存、筛选、编辑和删除；没有设备时明确记录为待验收。
  - 截取 MVP 六个关键状态与 Figma 对比，修复阻断性的间距、溢出、键盘和点击区域问题。

验证记录：390 x 844 Web 视口已完成 Chat、消息操作、Save to Space、Space、Shared Item Detail、Settings 与空筛选状态巡检，控制台无 warning/error；Android export 通过。当前环境没有 `adb`，所以 Android 真机/模拟器安装启动保留为环境待验收项。

## Risky Files and Rollback Points

- `src/bootstrap/AppProviders.tsx`：provider 顺序错误会影响手势、键盘和安全区；修改后立即跑 provider 测试与 Android export。
- `app/(main)/_layout.tsx`、`app/(main)/space/**`：路由形状会影响 typed routes；每次新增路由后立即 typecheck/export。
- `src/domain/shared-item/types.ts`：现有 Space fixture 和未来契约的共同边界；任何 kind/status 调整必须搜索全部消费者并保证 reducer 穷举。
- `src/design/tokens/**`、`ScreenScaffold.tsx`：全局视觉影响面大；先用新增 variant/primitive，避免无证据的全局值替换。
- `src/stores/preview-workspace/**`：所有 MVP 状态转换的单一来源；以 reducer 测试作为最小回滚保护。
- `android/`、`ios/`：视为 CNG 产物，不手工维护业务改动。

## Before `task.py start`

- [x] 用户已审阅并明确批准最新规划摘要进入实施。
- [x] `prd.md` 无阻塞 open questions，验收标准可观察且可测试。
- [x] `design.md` 与 `implement.md` 和 PRD 的范围一致。
- [x] 确认 Codex `dispatch_mode: inline`，实施时不要求 JSONL 子代理上下文清单。
- [x] 实施开始前重新运行 `trellis-before-dev` 并读取最新 frontend/guides 规范。
