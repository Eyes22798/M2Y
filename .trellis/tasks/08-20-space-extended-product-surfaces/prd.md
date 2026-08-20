# Space 完整对象与辅助页面

## Goal

补齐 Figma/PRD 中收藏、待办、笔记、文件、约定五类 Shared Item，以及 Activity、时间视图和统一搜索的完整用户闭环。

## Requirements

- 五类对象使用统一生命周期契约并保留各自的创建、编辑和状态语义。
- Agreement 覆盖 Draft、发起确认、请求修改、重新确认、完成与版本冲突。
- Activity、时间视图和搜索只显示有真实数据源支持的事件与结果。
- 覆盖空态、加载、错误、归档/恢复、删除撤销、离线与冲突状态。
- Android 页面与 Figma 对齐，并满足 Reduce Motion、触控和读屏要求。

## Acceptance Criteria

- [ ] 五类对象的主路径和关键状态均通过自动化与 Android 真机验收。
- [ ] Activity、时间视图和统一搜索可以从真实持久/同步数据得到结果。
- [ ] Figma/PRD 相关 P0 差距项被关闭或有明确延期决定。
- [ ] 任务归档时更新父任务完成度和声明边界。

## Dependency

- 依赖同步基础；文件对象依赖富消息与文件生命周期任务。
