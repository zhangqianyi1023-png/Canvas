import 'package:flutter/material.dart';
import 'package:storyboard_ui_contract/storyboard_ui_contract.dart';
import 'package:storyboard_ui_foundation/storyboard_ui_foundation.dart';

/// Integration-safe placeholder for the designer's implementation.
///
/// It proves the State/Actions boundary and Preview pipeline. Its visual design
/// is deliberately provisional and must be replaced after the HTML prototype
/// and design tokens are frozen.
class StoryboardWorkspaceV2 extends StatelessWidget {
  const StoryboardWorkspaceV2({
    required this.state,
    required this.actions,
    super.key,
  });

  final StoryboardUiState state;
  final StoryboardUiActions actions;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.storyboardTokens.canvas,
      child: switch (state.workspaceStatus) {
        StoryboardWorkspaceStatus.loading => const _CenteredState(
          icon: Icons.hourglass_top_rounded,
          title: '正在加载 Storyboard',
          showProgress: true,
        ),
        StoryboardWorkspaceStatus.empty => _CenteredState(
          icon: Icons.view_carousel_outlined,
          title: '当前场次还没有镜头',
          description: '请切换场次，或由业务流程生成镜头后再回来。',
          actionLabel: '重新加载',
          onAction: actions.retryWorkspace,
        ),
        StoryboardWorkspaceStatus.error => _CenteredState(
          icon: Icons.cloud_off_outlined,
          title: 'Storyboard 加载失败',
          description: state.errorMessage ?? '请稍后重试。',
          actionLabel: '重试',
          onAction: actions.retryWorkspace,
        ),
        StoryboardWorkspaceStatus.noAccess => const _CenteredState(
          icon: Icons.lock_outline_rounded,
          title: '没有访问当前 Storyboard 的权限',
          description: '请切换项目或联系项目管理员。',
        ),
        StoryboardWorkspaceStatus.ready => _ReadyWorkspace(
          state: state,
          actions: actions,
        ),
      },
    );
  }
}

class _ReadyWorkspace extends StatelessWidget {
  const _ReadyWorkspace({required this.state, required this.actions});

  final StoryboardUiState state;
  final StoryboardUiActions actions;

  @override
  Widget build(BuildContext context) {
    final selected = state.primarySelectedShot;
    return Column(
      children: [
        _WorkspaceHeader(state: state, actions: actions),
        if (state.notice case final notice?) _NoticeBanner(notice: notice),
        Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: _ShotCollection(state: state, actions: actions),
              ),
              if (state.detailPanel.isOpen)
                SizedBox(
                  width: 390,
                  child: selected == null
                      ? const _EmptyDetail()
                      : _ShotDetail(
                          shot: selected,
                          state: state,
                          actions: actions,
                        ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _WorkspaceHeader extends StatelessWidget {
  const _WorkspaceHeader({required this.state, required this.actions});

  final StoryboardUiState state;
  final StoryboardUiActions actions;

  @override
  Widget build(BuildContext context) {
    final tokens = context.storyboardTokens;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tokens.panel,
        border: Border(bottom: BorderSide(color: tokens.border)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: StoryboardSpacing.x16,
          vertical: StoryboardSpacing.x10,
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    state.context.projectName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: StoryboardSpacing.x2),
                  Text(
                    '第 ${state.context.episodeNumber} 集 · '
                    '第 ${state.context.sceneNumber} 场 · '
                    '${state.context.sceneLabel}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            _FrameModeMenu(state: state, actions: actions),
            const SizedBox(width: StoryboardSpacing.x8),
            Tooltip(
              message: state.viewMode == StoryboardViewMode.card
                  ? '切换到列表视图'
                  : '切换到卡片视图',
              child: IconButton(
                onPressed: () => actions.changeViewMode(
                  state.viewMode == StoryboardViewMode.card
                      ? StoryboardViewMode.list
                      : StoryboardViewMode.card,
                ),
                icon: Icon(
                  state.viewMode == StoryboardViewMode.card
                      ? Icons.view_list_outlined
                      : Icons.grid_view_outlined,
                ),
              ),
            ),
            Tooltip(
              message: state.detailPanel.isOpen ? '关闭详情面板' : '打开详情面板',
              child: IconButton(
                onPressed: () =>
                    actions.setDetailPanelOpen(!state.detailPanel.isOpen),
                icon: const Icon(Icons.vertical_split_outlined),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FrameModeMenu extends StatelessWidget {
  const _FrameModeMenu({required this.state, required this.actions});

  final StoryboardUiState state;
  final StoryboardUiActions actions;

  @override
  Widget build(BuildContext context) {
    return DropdownButton<StoryboardFrameMode>(
      value: state.frameMode,
      underline: const SizedBox.shrink(),
      borderRadius: BorderRadius.circular(StoryboardRadii.md),
      onChanged: (value) {
        if (value != null) actions.changeFrameMode(value);
      },
      items: StoryboardFrameMode.values
          .map((mode) => DropdownMenuItem(value: mode, child: Text(mode.label)))
          .toList(growable: false),
    );
  }
}

class _ShotCollection extends StatelessWidget {
  const _ShotCollection({required this.state, required this.actions});

  final StoryboardUiState state;
  final StoryboardUiActions actions;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(StoryboardSpacing.x12),
      child: state.viewMode == StoryboardViewMode.card
          ? LayoutBuilder(
              builder: (context, constraints) {
                final columns = (constraints.maxWidth / 300).floor().clamp(
                  1,
                  5,
                );
                return GridView.builder(
                  key: const Key('storyboard-card-grid'),
                  itemCount: state.shots.length,
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    crossAxisSpacing: StoryboardSpacing.x10,
                    mainAxisSpacing: StoryboardSpacing.x10,
                    childAspectRatio: 1.15,
                  ),
                  itemBuilder: (context, index) => _ShotCard(
                    shot: state.shots[index],
                    selected: state.selectedShotIds.contains(
                      state.shots[index].id,
                    ),
                    actions: actions,
                  ),
                );
              },
            )
          : ListView.separated(
              key: const Key('storyboard-shot-list'),
              itemCount: state.shots.length,
              separatorBuilder: (_, _) =>
                  const SizedBox(height: StoryboardSpacing.x8),
              itemBuilder: (context, index) => _ShotListTile(
                shot: state.shots[index],
                selected: state.selectedShotIds.contains(state.shots[index].id),
                actions: actions,
              ),
            ),
    );
  }
}

class _ShotCard extends StatelessWidget {
  const _ShotCard({
    required this.shot,
    required this.selected,
    required this.actions,
  });

  final StoryboardShotUiModel shot;
  final bool selected;
  final StoryboardUiActions actions;

  @override
  Widget build(BuildContext context) {
    final tokens = context.storyboardTokens;
    final media = shot.media.isEmpty ? null : shot.media.first;
    return Semantics(
      button: true,
      selected: selected,
      label: '${shot.displayCode} ${shot.title}',
      child: InkWell(
        borderRadius: BorderRadius.circular(StoryboardRadii.lg),
        onTap: () => actions.selectShot(shot.id),
        onDoubleTap: () => actions.activateShot(shot.id),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: selected ? tokens.panelRaised : tokens.panel,
            borderRadius: BorderRadius.circular(StoryboardRadii.lg),
            border: Border.all(
              color: selected ? tokens.brandPrimary : tokens.border,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(StoryboardSpacing.x10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: _MediaPlaceholder(media: media)),
                const SizedBox(height: StoryboardSpacing.x8),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        shot.displayCode,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelMedium,
                      ),
                    ),
                    _RenderPill(status: shot.renderStatus),
                  ],
                ),
                const SizedBox(height: StoryboardSpacing.x4),
                Text(
                  shot.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ShotListTile extends StatelessWidget {
  const _ShotListTile({
    required this.shot,
    required this.selected,
    required this.actions,
  });

  final StoryboardShotUiModel shot;
  final bool selected;
  final StoryboardUiActions actions;

  @override
  Widget build(BuildContext context) {
    final tokens = context.storyboardTokens;
    return ListTile(
      selected: selected,
      selectedTileColor: tokens.panelRaised,
      tileColor: tokens.panel,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(StoryboardRadii.md),
        side: BorderSide(color: selected ? tokens.brandPrimary : tokens.border),
      ),
      onTap: () => actions.selectShot(shot.id),
      onLongPress: () => actions.activateShot(shot.id),
      leading: SizedBox(
        width: 100,
        child: _MediaPlaceholder(
          media: shot.media.isEmpty ? null : shot.media.first,
        ),
      ),
      title: Text('${shot.displayCode} · ${shot.title}'),
      subtitle: Text(
        shot.description,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: _RenderPill(status: shot.renderStatus),
    );
  }
}

class _ShotDetail extends StatelessWidget {
  const _ShotDetail({
    required this.shot,
    required this.state,
    required this.actions,
  });

  final StoryboardShotUiModel shot;
  final StoryboardUiState state;
  final StoryboardUiActions actions;

  @override
  Widget build(BuildContext context) {
    final tokens = context.storyboardTokens;
    final canWrite = state.permission.canWrite;
    final generating = const {
      StoryboardRenderStatus.submitting,
      StoryboardRenderStatus.generating,
      StoryboardRenderStatus.localModifying,
    }.contains(shot.renderStatus);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: tokens.panel,
        border: Border(left: BorderSide(color: tokens.border)),
      ),
      child: ListView(
        padding: const EdgeInsets.all(StoryboardSpacing.x16),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  shot.displayCode,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Tooltip(
                message: '关闭详情面板',
                child: IconButton(
                  onPressed: () => actions.setDetailPanelOpen(false),
                  icon: const Icon(Icons.close),
                ),
              ),
            ],
          ),
          Text(shot.title, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: StoryboardSpacing.x8),
          Text(shot.description, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: StoryboardSpacing.x16),
          _DetailLabel(label: '图片 Prompt'),
          TextFormField(
            key: ValueKey('image-prompt-${shot.id}'),
            initialValue: shot.imagePrompt,
            enabled: canWrite,
            minLines: 3,
            maxLines: 6,
            onChanged: (value) => actions.updateImagePrompt(shot.id, value),
          ),
          const SizedBox(height: StoryboardSpacing.x12),
          _DetailLabel(label: '视频 Prompt'),
          TextFormField(
            key: ValueKey('video-prompt-${shot.id}'),
            initialValue: shot.videoPrompt,
            enabled: canWrite,
            minLines: 3,
            maxLines: 6,
            onChanged: (value) => actions.updateVideoPrompt(shot.id, value),
          ),
          const SizedBox(height: StoryboardSpacing.x16),
          _DetailLabel(label: '参考资产'),
          if (shot.referenceAssets.isEmpty)
            Text('暂无参考资产', style: Theme.of(context).textTheme.bodySmall)
          else
            Wrap(
              spacing: StoryboardSpacing.x6,
              runSpacing: StoryboardSpacing.x6,
              children: [
                for (final asset in shot.referenceAssets)
                  Chip(label: Text(asset.label)),
              ],
            ),
          const SizedBox(height: StoryboardSpacing.x16),
          if (shot.renderMessage case final message?) ...[
            Text(
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: shot.renderStatus == StoryboardRenderStatus.failed
                    ? tokens.danger
                    : tokens.textSecondary,
              ),
            ),
            const SizedBox(height: StoryboardSpacing.x8),
          ],
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: canWrite ? () => actions.saveShot(shot.id) : null,
                  child: Text(_saveLabel(state.saveStatus)),
                ),
              ),
              const SizedBox(width: StoryboardSpacing.x8),
              Expanded(
                child: FilledButton.icon(
                  key: const Key('generate-current-shot'),
                  onPressed: canWrite && shot.canGenerate && !generating
                      ? () => actions.generateShot(shot.id)
                      : null,
                  icon: generating
                      ? const SizedBox.square(
                          dimension: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.auto_awesome, size: 16),
                  label: Text(generating ? '生成中' : '生成当前镜头'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MediaPlaceholder extends StatelessWidget {
  const _MediaPlaceholder({required this.media});

  final StoryboardMediaUiModel? media;

  @override
  Widget build(BuildContext context) {
    final tokens = context.storyboardTokens;
    final status = media?.status ?? StoryboardMediaStatus.missing;
    final icon = switch (status) {
      StoryboardMediaStatus.missing => Icons.add_photo_alternate_outlined,
      StoryboardMediaStatus.loading => Icons.downloading_rounded,
      StoryboardMediaStatus.ready => Icons.image_outlined,
      StoryboardMediaStatus.failed => Icons.broken_image_outlined,
      StoryboardMediaStatus.unavailable => Icons.lock_outline,
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tokens.canvas,
        borderRadius: BorderRadius.circular(StoryboardRadii.md),
      ),
      child: Center(child: Icon(icon, color: tokens.textTertiary, size: 28)),
    );
  }
}

class _RenderPill extends StatelessWidget {
  const _RenderPill({required this.status});

  final StoryboardRenderStatus status;

  @override
  Widget build(BuildContext context) {
    final tokens = context.storyboardTokens;
    final color = switch (status) {
      StoryboardRenderStatus.ready => tokens.success,
      StoryboardRenderStatus.failed => tokens.danger,
      StoryboardRenderStatus.blocked => tokens.warning,
      StoryboardRenderStatus.generating ||
      StoryboardRenderStatus.submitting ||
      StoryboardRenderStatus.localModifying => tokens.brandPrimary,
      StoryboardRenderStatus.redrawPreview => tokens.info,
      StoryboardRenderStatus.pending => tokens.textTertiary,
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(StoryboardRadii.pill),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        child: Text(
          status.label,
          style: Theme.of(
            context,
          ).textTheme.labelMedium?.copyWith(color: color),
        ),
      ),
    );
  }
}

class _NoticeBanner extends StatelessWidget {
  const _NoticeBanner({required this.notice});

  final StoryboardNoticeUiModel notice;

  @override
  Widget build(BuildContext context) {
    final tokens = context.storyboardTokens;
    final color = switch (notice.tone) {
      StoryboardNoticeTone.neutral => tokens.textSecondary,
      StoryboardNoticeTone.info => tokens.info,
      StoryboardNoticeTone.success => tokens.success,
      StoryboardNoticeTone.warning => tokens.warning,
      StoryboardNoticeTone.danger => tokens.danger,
    };
    return ColoredBox(
      color: color.withValues(alpha: 0.1),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: StoryboardSpacing.x16,
          vertical: StoryboardSpacing.x8,
        ),
        child: Row(
          children: [
            Icon(Icons.info_outline, color: color, size: 16),
            const SizedBox(width: StoryboardSpacing.x8),
            Expanded(child: Text(notice.message)),
          ],
        ),
      ),
    );
  }
}

class _CenteredState extends StatelessWidget {
  const _CenteredState({
    required this.icon,
    required this.title,
    this.description,
    this.actionLabel,
    this.onAction,
    this.showProgress = false,
  });

  final IconData icon;
  final String title;
  final String? description;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool showProgress;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Padding(
          padding: const EdgeInsets.all(StoryboardSpacing.x32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 42,
                color: context.storyboardTokens.textTertiary,
              ),
              const SizedBox(height: StoryboardSpacing.x16),
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              if (description case final description?) ...[
                const SizedBox(height: StoryboardSpacing.x8),
                Text(
                  description,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              if (showProgress) ...[
                const SizedBox(height: StoryboardSpacing.x16),
                const SizedBox(width: 120, child: LinearProgressIndicator()),
              ],
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: StoryboardSpacing.x16),
                FilledButton(onPressed: onAction, child: Text(actionLabel!)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyDetail extends StatelessWidget {
  const _EmptyDetail();

  @override
  Widget build(BuildContext context) {
    return const _CenteredState(
      icon: Icons.touch_app_outlined,
      title: '选择一个镜头查看详情',
    );
  }
}

class _DetailLabel extends StatelessWidget {
  const _DetailLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: StoryboardSpacing.x6),
      child: Text(label, style: Theme.of(context).textTheme.labelMedium),
    );
  }
}

String _saveLabel(StoryboardSaveStatus status) => switch (status) {
  StoryboardSaveStatus.synced => '已同步',
  StoryboardSaveStatus.dirty => '保存',
  StoryboardSaveStatus.saving => '保存中…',
  StoryboardSaveStatus.failed => '保存失败，重试',
};

extension on StoryboardFrameMode {
  String get label => switch (this) {
    StoryboardFrameMode.firstLastFrame => '首尾帧',
    StoryboardFrameMode.keyframe => '关键帧',
    StoryboardFrameMode.multiReference => '多参考',
  };
}

extension on StoryboardRenderStatus {
  String get label => switch (this) {
    StoryboardRenderStatus.pending => '待生成',
    StoryboardRenderStatus.submitting => '提交中',
    StoryboardRenderStatus.generating => '生成中',
    StoryboardRenderStatus.ready => '已生成',
    StoryboardRenderStatus.failed => '失败',
    StoryboardRenderStatus.blocked => '不可用',
    StoryboardRenderStatus.localModifying => '重绘中',
    StoryboardRenderStatus.redrawPreview => '待确认',
  };
}
