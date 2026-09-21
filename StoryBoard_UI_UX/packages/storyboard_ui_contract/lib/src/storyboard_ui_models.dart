enum StoryboardWorkspaceStatus { loading, ready, empty, error, noAccess }

enum StoryboardPermission { editable, readOnly, noAccess }

extension StoryboardPermissionX on StoryboardPermission {
  bool get canRead => this != StoryboardPermission.noAccess;
  bool get canWrite => this == StoryboardPermission.editable;
}

enum StoryboardFrameMode { firstLastFrame, keyframe, multiReference }

enum StoryboardViewMode { list, card }

enum StoryboardRenderStatus {
  pending,
  submitting,
  generating,
  ready,
  failed,
  blocked,
  localModifying,
  redrawPreview,
}

enum StoryboardMediaKind { firstFrame, lastFrame, keyframe, video, reference }

enum StoryboardMediaStatus { missing, loading, ready, failed, unavailable }

enum StoryboardSaveStatus { synced, dirty, saving, failed }

enum StoryboardNoticeTone { neutral, info, success, warning, danger }

enum StoryboardReferenceSource { automatic, manual, inherited }

enum StoryboardBatchStatus {
  idle,
  selecting,
  submitting,
  running,
  completed,
  failed,
}

class StoryboardSceneUiModel {
  const StoryboardSceneUiModel({
    required this.id,
    required this.episodeNumber,
    required this.sceneNumber,
    required this.label,
    this.shotCount = 0,
    this.canOpen = true,
  });

  final String id;
  final int episodeNumber;
  final int sceneNumber;
  final String label;
  final int shotCount;
  final bool canOpen;
}

class StoryboardContextUiModel {
  const StoryboardContextUiModel({
    required this.projectId,
    required this.projectName,
    required this.episodeNumber,
    required this.sceneNumber,
    required this.sceneLabel,
    this.availableScenes = const [],
    this.isEpisodeScope = false,
  });

  final String projectId;
  final String projectName;
  final int episodeNumber;
  final int sceneNumber;
  final String sceneLabel;
  final List<StoryboardSceneUiModel> availableScenes;
  final bool isEpisodeScope;
}

class StoryboardMediaUiModel {
  const StoryboardMediaUiModel({
    required this.id,
    required this.kind,
    required this.status,
    this.previewSource,
    this.aspectRatio = 16 / 9,
    this.label,
    this.errorMessage,
  });

  final String id;
  final StoryboardMediaKind kind;
  final StoryboardMediaStatus status;
  final String? previewSource;
  final double aspectRatio;
  final String? label;
  final String? errorMessage;
}

class StoryboardReferenceAssetUiModel {
  const StoryboardReferenceAssetUiModel({
    required this.id,
    required this.label,
    required this.source,
    required this.media,
    this.canRemove = true,
  });

  final String id;
  final String label;
  final StoryboardReferenceSource source;
  final StoryboardMediaUiModel media;
  final bool canRemove;
}

class StoryboardShotUiModel {
  const StoryboardShotUiModel({
    required this.id,
    required this.displayCode,
    required this.title,
    required this.description,
    required this.imagePrompt,
    required this.videoPrompt,
    required this.durationLabel,
    required this.renderStatus,
    this.renderMessage,
    this.shotSize = '',
    this.cameraMovement = '',
    this.cameraAngle = '',
    this.focalLength = '',
    this.media = const [],
    this.referenceAssets = const [],
    this.groupId,
    this.groupLabel,
    this.canGenerate = true,
    this.canMove = true,
    this.canDelete = true,
  });

  final String id;
  final String displayCode;
  final String title;
  final String description;
  final String imagePrompt;
  final String videoPrompt;
  final String durationLabel;
  final String shotSize;
  final String cameraMovement;
  final String cameraAngle;
  final String focalLength;
  final StoryboardRenderStatus renderStatus;
  final String? renderMessage;
  final List<StoryboardMediaUiModel> media;
  final List<StoryboardReferenceAssetUiModel> referenceAssets;
  final String? groupId;
  final String? groupLabel;
  final bool canGenerate;
  final bool canMove;
  final bool canDelete;

  StoryboardMediaUiModel? mediaOf(StoryboardMediaKind kind) {
    for (final item in media) {
      if (item.kind == kind) return item;
    }
    return null;
  }
}

class StoryboardDetailPanelUiModel {
  const StoryboardDetailPanelUiModel({
    this.isOpen = true,
    this.widthFraction = 0.6,
    this.minimumFraction = 0.4,
    this.maximumFraction = 0.85,
  });

  final bool isOpen;
  final double widthFraction;
  final double minimumFraction;
  final double maximumFraction;
}

class StoryboardBatchActionUiModel {
  const StoryboardBatchActionUiModel({
    this.status = StoryboardBatchStatus.idle,
    this.label,
    this.completedCount = 0,
    this.totalCount = 0,
    this.message,
  });

  final StoryboardBatchStatus status;
  final String? label;
  final int completedCount;
  final int totalCount;
  final String? message;
}

class StoryboardNoticeUiModel {
  const StoryboardNoticeUiModel({
    required this.id,
    required this.message,
    this.tone = StoryboardNoticeTone.neutral,
    this.actionLabel,
  });

  final String id;
  final String message;
  final StoryboardNoticeTone tone;
  final String? actionLabel;
}

class StoryboardUiState {
  const StoryboardUiState({
    required this.workspaceStatus,
    required this.permission,
    required this.context,
    required this.frameMode,
    required this.viewMode,
    required this.shots,
    this.selectedShotIds = const {},
    this.primarySelectedShotId,
    this.detailPanel = const StoryboardDetailPanelUiModel(),
    this.saveStatus = StoryboardSaveStatus.synced,
    this.batchAction = const StoryboardBatchActionUiModel(),
    this.notice,
    this.errorMessage,
  });

  final StoryboardWorkspaceStatus workspaceStatus;
  final StoryboardPermission permission;
  final StoryboardContextUiModel context;
  final StoryboardFrameMode frameMode;
  final StoryboardViewMode viewMode;
  final List<StoryboardShotUiModel> shots;
  final Set<String> selectedShotIds;
  final String? primarySelectedShotId;
  final StoryboardDetailPanelUiModel detailPanel;
  final StoryboardSaveStatus saveStatus;
  final StoryboardBatchActionUiModel batchAction;
  final StoryboardNoticeUiModel? notice;
  final String? errorMessage;

  StoryboardShotUiModel? get primarySelectedShot {
    final selectedId = primarySelectedShotId;
    if (selectedId == null) return null;
    for (final shot in shots) {
      if (shot.id == selectedId) return shot;
    }
    return null;
  }

  StoryboardUiState copyWith({
    StoryboardWorkspaceStatus? workspaceStatus,
    StoryboardPermission? permission,
    StoryboardContextUiModel? context,
    StoryboardFrameMode? frameMode,
    StoryboardViewMode? viewMode,
    List<StoryboardShotUiModel>? shots,
    Set<String>? selectedShotIds,
    String? primarySelectedShotId,
    StoryboardDetailPanelUiModel? detailPanel,
    StoryboardSaveStatus? saveStatus,
    StoryboardBatchActionUiModel? batchAction,
    StoryboardNoticeUiModel? notice,
    String? errorMessage,
  }) {
    return StoryboardUiState(
      workspaceStatus: workspaceStatus ?? this.workspaceStatus,
      permission: permission ?? this.permission,
      context: context ?? this.context,
      frameMode: frameMode ?? this.frameMode,
      viewMode: viewMode ?? this.viewMode,
      shots: shots ?? this.shots,
      selectedShotIds: selectedShotIds ?? this.selectedShotIds,
      primarySelectedShotId:
          primarySelectedShotId ?? this.primarySelectedShotId,
      detailPanel: detailPanel ?? this.detailPanel,
      saveStatus: saveStatus ?? this.saveStatus,
      batchAction: batchAction ?? this.batchAction,
      notice: notice ?? this.notice,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }
}
