# Storyboard Flutter UI 开发与交付规范

## 1. 环境

- Flutter：`3.41.5 stable`
- Dart：`3.11.3`
- 目标平台：macOS
- UI Package：`packages/storyboard_ui_v2`
- Preview：`preview/storyboard_ui_preview`

未经工程团队确认，不升级 Flutter/Dart 主版本，不引入需要原生权限或签名配置的插件。

## 2. 允许依赖

设计师 UI Package 默认只允许：

- Flutter SDK。
- `storyboard_ui_contract`。
- `storyboard_ui_foundation`。

确需第三方 UI/动画依赖时，先提交用途、版本、License、包体和维护风险，由工程团队批准后添加。

## 3. 禁止依赖

- `flutter_riverpod` 或其他生产状态管理。
- `http`、Dio、WebSocket、SSE。
- 认证、Keychain、SharedPreferences、数据库。
- Hurricane Studio 生产目录中的相对路径依赖。
- 生产 API Base URL、Token 和环境配置。
- 未授权字体、图标和图片。

## 4. 目录建议

```text
packages/storyboard_ui_v2/lib/
├── storyboard_ui_v2.dart
└── src/
    ├── workspace/
    ├── components/
    ├── states/
    ├── dialogs/
    ├── motion/
    └── accessibility/
```

规则：

- 页面容器不直接承担所有细节渲染。
- 业务语义组件使用 `Storyboard...` 前缀。
- 私有局部组件用 `_` 前缀，不泄露无意义 API。
- 组件参数优先使用 Contract Model，而不是 Map/dynamic。
- 不复制后端 JSON 到 Widget。

## 5. 本地 UI 状态

允许保留：

- hover、focus、pressed。
- 展开/收起动画的瞬时状态。
- 文本编辑器尚未提交的本地值。
- 菜单/弹窗是否打开。
- 滚动位置。

不得在 UI 内独立维护：

- 生产选中镜头真源。
- 权限。
- 保存是否成功。
- 生成任务是否完成。
- 已绑定参考资产真源。
- 计费、配额或业务门禁。

## 6. 资源规范

- 所有资源必须进入交接包 `assets/` 并记录来源。
- SVG/Icon 需要明确命名和语义。
- 图片必须脱敏，且包含常规、竖图、横图、损坏/缺失场景。
- 字体必须说明 License；未冻结前 Preview 使用系统 fallback。
- 禁止使用线上 URL 作为 Preview 必需资源。

## 7. macOS 交互

- hover 不改变组件占位尺寸。
- 可点击区域使用正确鼠标光标。
- 纯图标按钮必须有 Tooltip/semanticsLabel。
- Tab 焦点顺序符合视觉顺序。
- 文本输入时工作台快捷键不得抢占输入法。
- 拖拽必须有开始、可放置、不可放置、完成和取消反馈。
- 弹窗支持 Esc 取消；破坏性动作不能成为默认安全动作。
- 动效需考虑系统减少动态效果偏好，避免依赖动效传递唯一信息。

## 8. 性能要求

- `largeProject` Fixture 下保持可用滚动。
- 列表/卡片 item 避免不必要的全树重建。
- 避免在 `build` 中解码大图、执行排序或创建昂贵对象。
- 图片容器必须稳定尺寸，加载不能引发布局抖动。
- 动画必须可中断，不能阻塞快速切镜头。

## 9. 测试要求

至少覆盖：

- loading/empty/error/readOnly 分支。
- 正常镜头集合与选中态。
- 生成按钮可用/禁用。
- 用户动作正确调用 `StoryboardUiActions`。
- 长 Prompt 和大镜头数量不产生布局异常。
- 关键组件 Semantics/Tooltip。

建议为冻结尺寸增加 Golden 测试，但 Golden 结果必须由双方在一致字体和机器配置下确认。

## 10. 每次交付前命令

```bash
dart format packages preview/storyboard_ui_preview/lib preview/storyboard_ui_preview/test
flutter analyze packages/storyboard_ui_contract
flutter test packages/storyboard_ui_contract
flutter analyze packages/storyboard_ui_foundation
flutter test packages/storyboard_ui_foundation
flutter analyze packages/storyboard_ui_v2
flutter test packages/storyboard_ui_v2
cd preview/storyboard_ui_preview
flutter analyze
flutter test
flutter run -d macos
```

## 11. Git 与交付

- 设计开发应在独立仓库或独立分支，不接触 Hurricane 主仓。
- 每次提交只包含本交接包内文件。
- 不提交 `.dart_tool/`、`build/`、IDE 私有配置和敏感文件。
- UI Contract 变更应单独提交，并附变更原因。
- 最终交付包含 README、CHANGELOG、测试结果和已知问题。
- 工程团队负责将审核通过的 Package 引入生产仓并解决集成冲突。
