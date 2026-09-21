# Hurricane Studio macOS Storyboard UI/UX 重构交接包

版本：`v0.1-draft`
整理日期：`2026-08-02`
适用范围：Hurricane Studio macOS Flutter 客户端的 Storyboard 工作台

## 1. 这套目录解决什么问题

本目录用于把 Storyboard UI/UX 完全重构拆成两个相互独立、最终可合并的工作面：

- 设计师负责：信息架构、视觉、交互、动效、全部 UI 状态，以及纯 Flutter 展示包。
- Hurricane 工程团队负责：数据模型、业务规则、Riverpod 状态、API、权限、保存、任务同步、Adapter、测试和最终合并。

设计师不需要获得 Hurricane Studio 前后端生产仓库。本目录提供可执行的 UI Contract、Mock Fixtures、主题基座和独立 macOS Preview，作为设计师的最小开发环境。

## 2. 真源优先级

发生冲突时按以下顺序判断：

1. 双方签字确认后的重构 PRD与变更记录。
2. `storyboard_ui_contract` 中可编译的数据和动作定义。
3. HTML 原型及其指定尺寸截图。
4. 状态与交互矩阵。
5. 即时沟通记录。

当前 `prototype/` 尚未收到设计师 HTML 原型，因此本交接包不能视为视觉冻结版。

## 3. 目录导航

| 路径 | 用途 | 主要使用者 |
|---|---|---|
| `docs/01_Storyboard_UI_UX重构PRD.md` | 范围、目标、产品规则与验收边界 | 双方 |
| `docs/02_双方工作边界与RACI.md` | 谁负责、谁审批、如何处理越界需求 | 双方 |
| `docs/03_业务能力保留清单.md` | 新 UX 不得遗漏的现有能力 | 设计师、产品 |
| `docs/04_UI状态与交互矩阵.md` | 页面和组件必须覆盖的状态 | 设计师 |
| `docs/05_UI_Contract说明.md` | UI State、Actions 和 Adapter 边界 | 双方工程人员 |
| `docs/06_Flutter开发与交付规范.md` | 目录、依赖、质量和禁止项 | 设计师开发 |
| `docs/07_验收清单.md` | 视觉、交互、代码和集成验收 | 双方 |
| `docs/08_现状源码索引_工程侧.md` | 当前实现位置和后续 Adapter 入口 | Hurricane 工程团队 |
| `packages/storyboard_ui_contract/` | 无 API、无 Riverpod 的稳定契约 | 双方工程人员 |
| `packages/storyboard_ui_foundation/` | Flutter Theme 和通用视觉基座 | 设计师 |
| `packages/storyboard_ui_v2/` | 设计师实际提交的纯 UI Package | 设计师 |
| `preview/storyboard_ui_preview/` | 无后端即可运行的 macOS 验收程序 | 双方 |
| `prototype/` | HTML、截图和交互演示 | 设计师 |
| `assets/` | 经授权的字体、图标和脱敏媒体 | 双方 |

## 4. 快速运行

环境基线：Flutter `3.41.5`、Dart `3.11.3`。

```bash
cd preview/storyboard_ui_preview
flutter pub get
flutter run -d macos
```

Preview 不连接 API、不读取 Token、不需要 Hurricane Studio 主工程。

## 5. 当前完成度

- [x] 工作边界和 RACI 初稿
- [x] 现有业务能力清单初稿
- [x] UI 状态与交互矩阵初稿
- [x] Flutter Contract v0.1
- [x] Mock Fixtures
- [x] 独立 macOS Preview 基座
- [x] Flutter 开发与验收规范
- [ ] 设计师 HTML 原型归档
- [ ] 设计 Token 视觉冻结
- [ ] 设计师确认组件清单与状态覆盖
- [ ] 产品确认新 UX 是否引入新的业务能力
- [ ] Contract v1.0 冻结
- [ ] 新 UI 视觉验收
- [ ] 生产 Adapter 与业务回归

## 6. 交付原则

`packages/storyboard_ui_v2` 必须始终满足：

- 只依赖 Flutter、`storyboard_ui_contract` 和 `storyboard_ui_foundation`。
- 不导入 Riverpod、HTTP、WebSocket、认证、数据库或生产配置。
- 所有展示数据从 `StoryboardUiState` 输入。
- 所有业务意图通过 `StoryboardUiActions` 输出。
- 在 Mock Preview 中覆盖正常、空、加载、失败、只读、生成中等场景。
