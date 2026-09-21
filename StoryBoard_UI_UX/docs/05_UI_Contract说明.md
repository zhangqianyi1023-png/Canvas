# Storyboard UI Contract 说明

对应代码：`packages/storyboard_ui_contract/`

## 1. Contract 的作用

Contract 是设计师 UI Package 与 Hurricane 生产业务之间唯一允许的接口：

```text
生产状态 → Adapter → StoryboardUiState → 新 UI
新 UI → StoryboardUiActions → Adapter → 生产业务
```

Contract 不描述 API URL、Provider、数据库或任务实现，只描述 UI 所需的稳定语义。

## 2. 输入：StoryboardUiState

UI 只能使用 State 中的字段渲染，不得自行查询数据或推导生产权限。

主要组成：

- `workspaceStatus`：工作台 loading/ready/empty/error/noAccess。
- `permission`：editable/readOnly/noAccess。
- `context`：项目、集、场和可切换场次。
- `frameMode`：首尾帧、关键帧兼容、多参考。
- `viewMode`：列表/卡片。
- `shots`：脱离生产模型的镜头 UI Model。
- `selectedShotIds` / `primarySelectedShotId`：选择状态。
- `detailPanel`：详情面板打开和尺寸。
- `saveStatus`：保存状态。
- `batchAction`：批量动作状态。
- `notice`：可选的工作台级消息。

## 3. 输出：StoryboardUiActions

UI 只表达用户意图，不能假设动作已经成功。例如：

```dart
await actions.generateShot(shotId);
```

调用完成不代表媒体已经生成。工程侧随后通过新的 `StoryboardUiState` 把 submitting/generating/ready/failed 状态送回 UI。

动作分组：

- 导航：切场、切换视图、选择镜头、打开/关闭详情。
- 编辑：更新 Prompt、保存镜头。
- 生成：单镜生成、批量生成、失败重试。
- 媒体：打开预览、打开帧编辑器、重试媒体。
- 参考资产：添加、移除、查看。
- 组织：移动、删除、创建/解除分组。
- 系统：重试工作台、调整详情宽度。

## 4. 设计师使用方式

```dart
class StoryboardWorkspaceV2 extends StatelessWidget {
  const StoryboardWorkspaceV2({
    required this.state,
    required this.actions,
    super.key,
  });

  final StoryboardUiState state;
  final StoryboardUiActions actions;
}
```

按钮必须根据 State 决定是否可操作，并在触发时调用 Actions：

```dart
onPressed: state.permission.canWrite && shot.canGenerate
    ? () => actions.generateShot(shot.id)
    : null,
```

禁止在 UI 内创建乐观的生产成功状态。需要即时反馈时，可以使用纯瞬时状态，例如 hover、面板动画或输入框本地编辑，但最终业务状态以新 State 为准。

## 5. 工程侧 Adapter 示例

以下只说明边界，不属于设计师交付：

```dart
class StoryboardWorkspaceAdapter extends ConsumerWidget {
  const StoryboardWorkspaceAdapter({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productionState = ref.watch(storyboardStationProvider);
    final uiState = mapProductionStateToUiState(ref, productionState);

    return StoryboardWorkspaceV2(
      state: uiState,
      actions: ProductionStoryboardUiActions(ref),
    );
  }
}
```

Adapter 必须负责：

- 生产枚举和 UI 枚举映射。
- 媒体 URL/引用转换为 UI 可展示输入。
- 权限和动作可用性。
- 保存、生成、移动和删除等调用。
- 错误转为用户可理解的 UI 状态。
- 跨工作台选择和任务状态同步。

## 6. Contract 版本规则

- `0.x`：交接阶段，可在双方确认后调整。
- `1.0.0`：设计开发前冻结的第一版。
- 新增可选字段或新动作：minor 版本。
- 删除字段、改变含义、修改必填性：major 版本。
- 只修正文档或不改变语义：patch 版本。

任何破坏性变更都需要：

1. PRD 变更记录。
2. Fixture 更新。
3. UI Package 测试更新。
4. Adapter 迁移计划。

## 7. 不应进入 Contract 的内容

- 生产数据库 ID 之外的内部实现字段。
- API Path、HTTP 状态码、Header、Token。
- Riverpod Provider 类型。
- 后端 JSON 原样结构。
- 租户、环境、签名 URL 生成规则。
- 只为旧 Widget 服务的临时字段。

Contract 应以用户可见语义为中心，而不是把现有生产模型复制给设计师。
