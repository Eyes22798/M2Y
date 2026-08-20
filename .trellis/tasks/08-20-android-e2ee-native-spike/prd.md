# Android E2EE 原生集成技术验证

## Goal

在不自行发明密码协议、不把占位 UI 伪装为安全能力的前提下，完成 Android 优先的原生 E2EE 集成技术验证：证明一个可评审的原生密码实现能够由 Expo Development Build 调用，并覆盖身份密钥、会话建立、双向消息加解密、持久化恢复和关键失败路径，为后续真实 M2Y-ID、配对、安全号码与密文同步提供可信边界。

本任务是 M0 Spike，只回答“选定方案能否安全、稳定地接入当前工程”。它不发布完整配对或同步功能，也不把 Spike 结果表述为生产级 E2EE 已完成。

## Background

- Android 安全与数据基础已完成：SecureStore 密钥生命周期、SQLCipher 持久存储、安全启动门、强生物识别和真机 ARM64 验收均通过。
- 产品路线要求真实身份、配对、安全号码和密文同步，但当前相关 route 仍是诚实占位页。
- 项目技术基线明确禁止 JavaScript 自研密码学，并要求在固化 E2EE 架构前完成原生集成 Spike。
- 既有顺序是本地安全基础 → 原生 E2EE/配对与同步基础 → 更丰富的业务状态和页面。

## Requirements

### R1 — Spike 边界与安全表述

- 只采用有公开协议说明、持续维护且可评审的成熟实现或绑定；不得实现自定义密码算法或 TypeScript 加密核心。
- M2Y 接受 `libsignal` 的 AGPLv3 开源义务；后续分发、对应源码提供方式与第三方 notices 必须作为发布门禁保留。
- 明确记录保护对象、攻击边界、残余风险、库/绑定来源、版本与许可证。
- 密钥、明文、会话状态、指纹和原生异常不得进入日志、测试快照或分析事件。
- Spike 通过只表示 Android 集成方案可行，不等于协议实现已经完成独立安全审计或生产发布认证。

### R2 — Android 原生集成能力

- 在 Expo Development Build / CNG 工作流内建立可重复的 Android 原生模块或绑定构建路径，支持 `arm64-v8a` 真机和 `x86_64` 模拟器。
- JavaScript/TypeScript 只依赖最小 typed port，不直接操作私钥或实现协议步骤。
- 原生边界提供稳定的 typed success/error contract，并能安全关闭或销毁临时会话资源。
- `SignalProtocolStore` 的同步回调不得反向调用异步 JavaScript repository；identity/pre-key/signed-pre-key/Kyber/session/sender-key 状态由原生侧隔离持久 store 管理。

### R3 — 最小协议实验

- 在隔离的测试身份 Alice/Bob 之间生成原生 identity/signed pre-key/one-time pre-key/Kyber pre-key，使用 PQXDH bundle 建立会话并完成首条 pre-key 消息与后续双向 ratcheted 消息加解密。
- 验证会话持久化后重新加载仍可继续通信，并覆盖乱序、重复消息、损坏密文、错误身份与密钥变化的 fail-closed 行为。
- 执行 1,000 条双向消息基准与 100 MB 附件密钥封装基准；正文/附件本体不通过 JS/native bridge 往返来冒充最终文件加密方案。
- 安全号码派生只验证官方 fingerprint API 的一致性与身份变化可见性，不在本任务实现生产 UI。

### R4 — 与现有安全存储的边界

- Spike 私密状态使用隔离、可清理且文档化的 Android Keystore 加密 checkpoint；不得写入 AsyncStorage、public config、普通 SharedPreferences 或源码常量。
- 现有 `SecureWorkspaceGate` 继续作为 dev route 的外层访问门：锁定或恢复状态不挂载 harness。Checkpoint key 不直接要求生物识别，不得宣称 protocol state 已绑定强生物识别。
- App uninstall 删除 app-private checkpoint 与 Keystore alias；checkpoint 存在但 alias 缺失/失效时 fail-closed，不静默重建 persona 覆盖旧状态。
- 所有验收数据使用独立测试身份/数据库，并在验收结束后可验证地清理。
- 原生 store 必须满足 record copy/commit、单线程串行化、事务边界和 crash-safe reopen；不得用仅内存 store 冒充重启持久化证据。
- 每个顶层协议操作在 working-copy store 上执行，只有 Keystore AES-GCM + `AtomicFile` checkpoint 成功后才返回结果；checkpoint 失败必须丢弃 working copy，不暴露未持久化明文/密文结果。

### R5 — 后续架构决策输入

- 输出 go/no-go 结论，列出对 M2Y-ID、二维码/握手码配对、安全号码、单设备约束和密文同步 envelope 的影响。
- 若选定方案无法满足 Expo/RN 0.85、Android ABI、许可证、维护性或协议正确性要求，必须停止在 Spike，不通过弱化验收继续产品化。

## Acceptance Criteria

- [x] 有对官方 Android artifacts、官方 Node package、已归档旧 Java/JavaScript 实现及第三方 RN binding 风险的选型比较，覆盖来源、维护状态、Android/RN/Expo 兼容性、许可证和安全边界。
- [x] 选定方案能在当前 Expo Development Build 中为 `arm64-v8a` 与 `x86_64` 构建。
- [x] Alice/Bob 隔离身份可完成会话建立和双向消息加解密，明文与密钥不跨越被禁止的日志/配置边界。
- [x] 会话状态持久化并重新加载后可继续通信；关键无效输入保持 fail-closed。
- [x] 乱序消息仍可在协议允许的窗口内解密；重复消息、损坏密文、错误身份和密钥变化返回稳定拒绝代码。
- [x] 1,000 条消息与 100 MB 附件密钥封装基准记录耗时、内存和包体变化，不输出明文或密钥。
- [x] 原生验收 harness 只输出稳定、脱敏的结果代码，并能清理全部临时测试材料。
- [x] 自动化测试覆盖 typed adapter、生命周期、错误映射和 JS/native 边界；Android 模拟器与 ARM64 真机各完成一次验收。
- [x] 形成明确 go/no-go 结论和下一任务建议，但不在本任务实现生产配对、服务端或密文同步。

## Out of Scope

- 生产 M2Y-ID 注册、二维码/握手码配对、双方请求确认和安全号码 UI。
- 服务端、推送、outbox/inbox、跨设备同步和多设备协议。
- 恢复包、换机、密钥轮换、群聊、附件加密和完整生产威胁审计。
- iOS 集成、商店发布或对外宣称 E2EE 已正式上线。

## Key Decisions

| Decision | Choice | Consequence |
|---|---|---|
| `libsignal` 许可证 | 接受 AGPLv3 开源义务 | 可以继续原生集成 Spike；发布流程必须提供对应源码并保留许可证/第三方 notices，仍需单独核对应用商店条款 |
| 最小协议实验 | 完整 PQXDH pre-key 建链 + 后续 ratcheted 双向消息 | 证明真实协议状态与失败语义，不用“JNI 成功加载”冒充 E2EE 可行性 |
| 版本策略 | 精确锁定 `libsignal` `0.101.0`，禁止 Maven 浮动版本 | 上游发布频繁且不承诺第三方稳定性；升级必须重新跑 ABI、协议和持久化 fixture |
| 当前平台范围 | Android-only go/no-go；iOS 一致性另立后续任务 | 延续用户批准的 Android 优先顺序；不把 Android 结论冒充双平台 Spike D 完成 |
| Spike 持久化 | Android Keystore AES-GCM 加密的 versioned atomic checkpoint | 满足同步 store callback、重启恢复和 fail-closed 证据；明确不是生产同步存储 |

## Planning State

用户已批准本规划；实现、自动化门禁、API 37.1 x86_64 模拟器和 realme RMX3888 ARM64 真机完整验收均已完成。任务达到 M0 Spike 验收标准，可以关闭归档。
