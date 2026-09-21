# storyboard_ui_contract

Hurricane Studio Storyboard 新 UI 与生产 Adapter 之间的纯 Dart 契约。

- 无 Flutter Widget。
- 无 Riverpod。
- 无 API/HTTP/WebSocket。
- 无认证和生产配置。
- `storyboard_ui_contract.dart` 导出正式 State/Actions。
- `storyboard_ui_fixtures.dart` 仅供 Preview 和测试使用。

当前版本为 `0.1.0` 草案；设计开发正式开始前需要双方冻结为 `1.0.0`。
