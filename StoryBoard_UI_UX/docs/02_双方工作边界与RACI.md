# Storyboard UI/UX 重构双方工作边界与 RACI

## 1. 一句话边界

设计师拥有 Storyboard UI/UX 设计和纯 Flutter 展示实现的主责；Hurricane 工程团队拥有业务能力、数据契约、状态管理、接口集成、生产测试和代码合并的主责。

## 2. RACI

说明：`R` 执行，`A` 最终负责，`C` 参与确认，`I` 被告知。

| 工作项 | 设计师 | Hurricane 工程团队 | 产品负责人 |
|---|---|---|---|
| 用户流程、信息架构 | R | C | A |
| HTML 原型、视觉规范 | R/A | C | C |
| 组件、状态、动效设计 | R/A | C | I |
| 纯 Flutter UI Package | R/A | C | I |
| Mock Fixture 的视觉表达 | R | C | A |
| 业务字段与状态语义 | C | R | A |
| UI Contract | C | R | A |
| Provider/Notifier | I | R/A | I |
| API/WebSocket/认证 | I | R/A | I |
| 权限、保存、生成业务规则 | C | R | A |
| 生产 Adapter | I | R/A | I |
| 视觉验收 | A | C | C |
| 业务回归 | C | R/A | C |
| 合并、发布、回滚 | I | R/A | I |

## 3. 设计师负责

- HTML 原型及视觉规范维护。
- 页面信息层级和任务路径。
- Flutter Widget、布局、动效和响应式设计。
- hover、pressed、selected、focus、disabled 等桌面状态。
- 空、加载、失败、只读、生成中等状态的完整视觉。
- Mock 数据驱动的 Preview。
- 按 Contract 触发用户意图，不实现业务结果。
- 修复视觉验收和 UI Package 自身缺陷。

## 4. Hurricane 工程团队负责

- 业务能力清单和不能破坏的产品语义。
- Contract 的字段、枚举、动作和版本冻结。
- 真实数据到 UI State 的映射。
- 用户动作到 Provider/API 的绑定。
- 权限、保存、生成、媒体、任务同步和错误恢复。
- 对设计师 Package 做依赖、安全、性能和质量审查。
- 生产 Adapter、回归测试、合并、发布与回滚。

## 5. 必须共同确认的事项

以下需求不能由任何一方单独决定：

- 新增或删除业务能力。
- 改变保存/自动保存/确认语义。
- 改变权限或可见性规则。
- 改变镜头、Take、场次等数据含义。
- 新增后端字段或长任务。
- 改变高风险动作的确认与撤销策略。
- Contract 的破坏性变更。

## 6. 越界处理

设计师发现 Contract 不足时：

1. 在 PRD 的“待确认”中登记用户场景。
2. 提供期望 UI 和业务结果，不直接新增生产字段。
3. 工程团队评估已有能力、Adapter 可处理性及是否需要后端变更。
4. 产品负责人确认后更新 Contract 版本。
5. 设计师再实现正式状态。

工程团队集成时发现 UI 无法承载业务状态：

1. 先用已有 Contract 和 Fixture 复现。
2. 判定是 UI 缺口、Contract 缺口还是业务变更。
3. 禁止在 Adapter 中静默改变设计语义。
4. 双方确认后修改 UI 或 Contract。

## 7. 交付完成的定义

设计师完成不等于生产上线。完成分两层：

- UI 完成：纯 UI Package、全部 Fixture、视觉和交互验收通过。
- 产品完成：Adapter、真实数据、权限、保存、任务、媒体和回归通过并完成发布。
