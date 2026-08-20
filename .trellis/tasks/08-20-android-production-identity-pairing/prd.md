# Android 生产身份、配对与安全号码闭环

## Goal

把已通过的 Android 本地安全与 libsignal Spike 产品化为可由两台 Android 设备真实完成的 M2Y-ID、配对请求和安全号码闭环。

## Requirements

- 使用原生受保护身份材料，禁止 TypeScript 密码学和验收 persona/checkpoint 进入生产状态。
- 覆盖本地身份创建、可选显示名、M2Y-ID、扫码/M2Y-ID/一次性握手码三种入口。
- 覆盖请求接受、拒绝、取消、过期、网络失败和已有关系阻断。
- 双方必须核验安全号码；身份变化时 fail-closed 并要求重新核验。
- Android 优先；同步一般消息、恢复换机和 iOS 不在本子任务内。

## Acceptance Criteria

- [ ] 两台 Android 设备可建立真实关系且没有私钥/明文跨越禁止边界。
- [ ] 三种配对入口和主要失败状态均有自动化与真机证据。
- [ ] 安全号码一致才能完成配对，身份替换会阻断并可见。
- [ ] 任务归档时更新父任务完成度和声明边界。

## Dependency

- 依赖已归档的 Android 安全数据基础和 E2EE native Spike。
