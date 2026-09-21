import 'storyboard_ui_models.dart';

enum StoryboardFixtureScenario {
  normal,
  empty,
  loading,
  error,
  readOnly,
  generating,
  failedGeneration,
  largeProject,
}

abstract final class StoryboardFixtures {
  static const _context = StoryboardContextUiModel(
    projectId: 'preview-project',
    projectName: '《雾港来信》UI 预览项目',
    episodeNumber: 1,
    sceneNumber: 3,
    sceneLabel: '雨夜码头',
    availableScenes: [
      StoryboardSceneUiModel(
        id: 'scene-1-2',
        episodeNumber: 1,
        sceneNumber: 2,
        label: '仓库外',
        shotCount: 8,
      ),
      StoryboardSceneUiModel(
        id: 'scene-1-3',
        episodeNumber: 1,
        sceneNumber: 3,
        label: '雨夜码头',
        shotCount: 12,
      ),
      StoryboardSceneUiModel(
        id: 'scene-1-4',
        episodeNumber: 1,
        sceneNumber: 4,
        label: '旧控制室',
        shotCount: 6,
      ),
    ],
  );

  static const _readyFirst = StoryboardMediaUiModel(
    id: 'media-shot-001-first',
    kind: StoryboardMediaKind.firstFrame,
    status: StoryboardMediaStatus.ready,
    label: '首帧',
  );

  static const _loadingLast = StoryboardMediaUiModel(
    id: 'media-shot-001-last',
    kind: StoryboardMediaKind.lastFrame,
    status: StoryboardMediaStatus.loading,
    label: '尾帧',
  );

  static const _reference = StoryboardReferenceAssetUiModel(
    id: 'asset-lighthouse',
    label: '旧灯塔环境参考',
    source: StoryboardReferenceSource.automatic,
    media: StoryboardMediaUiModel(
      id: 'media-reference-lighthouse',
      kind: StoryboardMediaKind.reference,
      status: StoryboardMediaStatus.ready,
      label: '场景参考',
    ),
    canRemove: false,
  );

  static const _shots = [
    StoryboardShotUiModel(
      id: 'shot-001',
      displayCode: 'EP01-SC03-SH001',
      title: '远景建立：雨夜码头',
      description: '暴雨中的旧码头，远处灯塔被雾气遮蔽，人物从画面右侧进入。',
      imagePrompt: '电影感远景，雨夜码头，潮湿地面反射青色灯光，低饱和，高对比。',
      videoPrompt: '镜头缓慢向前推进，雨丝斜向掠过，远处警示灯间歇闪烁。',
      durationLabel: '4s',
      shotSize: '远景',
      cameraMovement: '缓慢推进',
      cameraAngle: '平视',
      focalLength: '35mm',
      renderStatus: StoryboardRenderStatus.ready,
      media: [_readyFirst, _loadingLast],
      referenceAssets: [_reference],
    ),
    StoryboardShotUiModel(
      id: 'shot-002',
      displayCode: 'EP01-SC03-SH002',
      title: '人物近景：发现信封',
      description: '人物停下脚步，从积水边缘拾起被雨水浸湿的信封。',
      imagePrompt: '人物手部与旧信封近景，浅景深，雨水细节，冷色环境光。',
      videoPrompt: '手指触碰信封，镜头轻微下摇并停留在褪色邮戳。',
      durationLabel: '3s',
      shotSize: '近景',
      cameraMovement: '下摇',
      cameraAngle: '俯拍',
      focalLength: '50mm',
      renderStatus: StoryboardRenderStatus.pending,
      media: [
        StoryboardMediaUiModel(
          id: 'media-shot-002-first',
          kind: StoryboardMediaKind.firstFrame,
          status: StoryboardMediaStatus.missing,
          label: '首帧',
        ),
        StoryboardMediaUiModel(
          id: 'media-shot-002-last',
          kind: StoryboardMediaKind.lastFrame,
          status: StoryboardMediaStatus.missing,
          label: '尾帧',
        ),
      ],
    ),
    StoryboardShotUiModel(
      id: 'shot-003',
      displayCode: 'EP01-SC03-SH003',
      title: '反应镜头：灯塔熄灭',
      description: '人物抬头时灯塔突然熄灭，画面短暂陷入黑暗。',
      imagePrompt: '人物面部反应特写，背景灯塔虚化，冷光突然消失前的瞬间。',
      videoPrompt: '焦点从人物眼睛拉到远处灯塔，灯光熄灭后停顿半秒。',
      durationLabel: '2.5s',
      shotSize: '特写',
      cameraMovement: '拉焦',
      cameraAngle: '微仰',
      focalLength: '85mm',
      renderStatus: StoryboardRenderStatus.failed,
      renderMessage: '生成任务失败，请检查参考素材后重试。',
      media: [
        StoryboardMediaUiModel(
          id: 'media-shot-003-key',
          kind: StoryboardMediaKind.keyframe,
          status: StoryboardMediaStatus.failed,
          label: '关键帧',
          errorMessage: '预览不可用',
        ),
      ],
    ),
  ];

  static StoryboardUiState forScenario(StoryboardFixtureScenario scenario) {
    return switch (scenario) {
      StoryboardFixtureScenario.normal => normal,
      StoryboardFixtureScenario.empty => empty,
      StoryboardFixtureScenario.loading => loading,
      StoryboardFixtureScenario.error => error,
      StoryboardFixtureScenario.readOnly => readOnly,
      StoryboardFixtureScenario.generating => generating,
      StoryboardFixtureScenario.failedGeneration => failedGeneration,
      StoryboardFixtureScenario.largeProject => largeProject,
    };
  }

  static const normal = StoryboardUiState(
    workspaceStatus: StoryboardWorkspaceStatus.ready,
    permission: StoryboardPermission.editable,
    context: _context,
    frameMode: StoryboardFrameMode.firstLastFrame,
    viewMode: StoryboardViewMode.card,
    shots: _shots,
    selectedShotIds: {'shot-001'},
    primarySelectedShotId: 'shot-001',
  );

  static const empty = StoryboardUiState(
    workspaceStatus: StoryboardWorkspaceStatus.empty,
    permission: StoryboardPermission.editable,
    context: _context,
    frameMode: StoryboardFrameMode.firstLastFrame,
    viewMode: StoryboardViewMode.card,
    shots: [],
  );

  static const loading = StoryboardUiState(
    workspaceStatus: StoryboardWorkspaceStatus.loading,
    permission: StoryboardPermission.editable,
    context: _context,
    frameMode: StoryboardFrameMode.firstLastFrame,
    viewMode: StoryboardViewMode.card,
    shots: [],
  );

  static const error = StoryboardUiState(
    workspaceStatus: StoryboardWorkspaceStatus.error,
    permission: StoryboardPermission.editable,
    context: _context,
    frameMode: StoryboardFrameMode.firstLastFrame,
    viewMode: StoryboardViewMode.card,
    shots: [],
    errorMessage: '无法加载当前场次，请检查连接后重试。',
  );

  static const readOnly = StoryboardUiState(
    workspaceStatus: StoryboardWorkspaceStatus.ready,
    permission: StoryboardPermission.readOnly,
    context: _context,
    frameMode: StoryboardFrameMode.firstLastFrame,
    viewMode: StoryboardViewMode.card,
    shots: _shots,
    selectedShotIds: {'shot-001'},
    primarySelectedShotId: 'shot-001',
    notice: StoryboardNoticeUiModel(
      id: 'read-only',
      message: '当前场次为只读权限，你可以浏览和预览，但不能修改或生成。',
      tone: StoryboardNoticeTone.warning,
    ),
  );

  static final generating = normal.copyWith(
    shots: [
      _shots[0],
      StoryboardShotUiModel(
        id: 'shot-002',
        displayCode: 'EP01-SC03-SH002',
        title: '人物近景：发现信封',
        description: '人物停下脚步，从积水边缘拾起被雨水浸湿的信封。',
        imagePrompt: '人物手部与旧信封近景，浅景深，雨水细节，冷色环境光。',
        videoPrompt: '手指触碰信封，镜头轻微下摇并停留在褪色邮戳。',
        durationLabel: '3s',
        renderStatus: StoryboardRenderStatus.generating,
        renderMessage: '正在生成首尾帧…',
        media: [_loadingLast],
        canGenerate: false,
      ),
      _shots[2],
    ],
    selectedShotIds: {'shot-002'},
    primarySelectedShotId: 'shot-002',
  );

  static final failedGeneration = normal.copyWith(
    selectedShotIds: {'shot-003'},
    primarySelectedShotId: 'shot-003',
  );

  static final largeProject = normal.copyWith(
    shots: List<StoryboardShotUiModel>.generate(80, (index) {
      final number = index + 1;
      return StoryboardShotUiModel(
        id: 'large-shot-$number',
        displayCode: 'EP01-SC03-SH${number.toString().padLeft(3, '0')}',
        title: '大数据镜头 $number',
        description: number % 7 == 0
            ? '这是用于验证长文本、不同字号和卡片高度稳定性的镜头描述。画面包含多层人物调度、环境细节以及较长的动作说明。'
            : '批量滚动性能测试镜头。',
        imagePrompt: '脱敏的预览 Prompt $number',
        videoPrompt: '脱敏的视频 Prompt $number',
        durationLabel: '${2 + (number % 5)}s',
        renderStatus: number % 9 == 0
            ? StoryboardRenderStatus.generating
            : StoryboardRenderStatus.ready,
        media: [_readyFirst],
      );
    }),
    selectedShotIds: {'large-shot-1'},
    primarySelectedShotId: 'large-shot-1',
  );
}
