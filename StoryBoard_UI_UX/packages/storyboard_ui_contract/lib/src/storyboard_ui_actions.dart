import 'storyboard_ui_models.dart';

typedef StoryboardVoidAction = void Function();
typedef StoryboardStringAction = void Function(String value);
typedef StoryboardAsyncStringAction = Future<void> Function(String value);

class StoryboardUiActions {
  const StoryboardUiActions({
    required this.retryWorkspace,
    required this.changeScene,
    required this.changeFrameMode,
    required this.changeViewMode,
    required this.selectShot,
    required this.activateShot,
    required this.setDetailPanelOpen,
    required this.setDetailPanelFraction,
    required this.updateImagePrompt,
    required this.updateVideoPrompt,
    required this.saveShot,
    required this.generateShot,
    required this.generateBatch,
    required this.retryGeneration,
    required this.openMedia,
    required this.openFrameEditor,
    required this.retryMedia,
    required this.addReferenceAsset,
    required this.removeReferenceAsset,
    required this.moveShot,
    required this.deleteShot,
    required this.createGroup,
    required this.dissolveGroup,
  });

  final StoryboardVoidAction retryWorkspace;
  final StoryboardStringAction changeScene;
  final void Function(StoryboardFrameMode mode) changeFrameMode;
  final void Function(StoryboardViewMode mode) changeViewMode;
  final void Function(String shotId, {bool extendSelection}) selectShot;
  final StoryboardStringAction activateShot;
  final void Function(bool isOpen) setDetailPanelOpen;
  final void Function(double fraction) setDetailPanelFraction;
  final void Function(String shotId, String value) updateImagePrompt;
  final void Function(String shotId, String value) updateVideoPrompt;
  final StoryboardAsyncStringAction saveShot;
  final StoryboardAsyncStringAction generateShot;
  final Future<void> Function(List<String> shotIds) generateBatch;
  final StoryboardAsyncStringAction retryGeneration;
  final void Function(String shotId, String mediaId) openMedia;
  final void Function(String shotId, StoryboardMediaKind target)
  openFrameEditor;
  final void Function(String shotId, String mediaId) retryMedia;
  final StoryboardAsyncStringAction addReferenceAsset;
  final Future<void> Function(String shotId, String assetId)
  removeReferenceAsset;
  final Future<void> Function(String shotId, String targetSceneId) moveShot;
  final StoryboardAsyncStringAction deleteShot;
  final Future<void> Function(List<String> shotIds) createGroup;
  final StoryboardAsyncStringAction dissolveGroup;

  factory StoryboardUiActions.noop() {
    return StoryboardUiActions(
      retryWorkspace: () {},
      changeScene: (_) {},
      changeFrameMode: (_) {},
      changeViewMode: (_) {},
      selectShot: (_, {extendSelection = false}) {},
      activateShot: (_) {},
      setDetailPanelOpen: (_) {},
      setDetailPanelFraction: (_) {},
      updateImagePrompt: (_, _) {},
      updateVideoPrompt: (_, _) {},
      saveShot: (_) async {},
      generateShot: (_) async {},
      generateBatch: (_) async {},
      retryGeneration: (_) async {},
      openMedia: (_, _) {},
      openFrameEditor: (_, _) {},
      retryMedia: (_, _) {},
      addReferenceAsset: (_) async {},
      removeReferenceAsset: (_, _) async {},
      moveShot: (_, _) async {},
      deleteShot: (_) async {},
      createGroup: (_) async {},
      dissolveGroup: (_) async {},
    );
  }
}
