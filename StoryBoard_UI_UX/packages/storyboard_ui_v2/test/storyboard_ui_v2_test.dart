import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:storyboard_ui_contract/storyboard_ui_contract.dart';
import 'package:storyboard_ui_contract/storyboard_ui_fixtures.dart';
import 'package:storyboard_ui_foundation/storyboard_ui_foundation.dart';
import 'package:storyboard_ui_v2/storyboard_ui_v2.dart';

void main() {
  testWidgets('normal fixture renders and emits generate action', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(1440, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    String? generatedShotId;
    final noop = StoryboardUiActions.noop();
    final actions = StoryboardUiActions(
      retryWorkspace: noop.retryWorkspace,
      changeScene: noop.changeScene,
      changeFrameMode: noop.changeFrameMode,
      changeViewMode: noop.changeViewMode,
      selectShot: noop.selectShot,
      activateShot: noop.activateShot,
      setDetailPanelOpen: noop.setDetailPanelOpen,
      setDetailPanelFraction: noop.setDetailPanelFraction,
      updateImagePrompt: noop.updateImagePrompt,
      updateVideoPrompt: noop.updateVideoPrompt,
      saveShot: noop.saveShot,
      generateShot: (shotId) async => generatedShotId = shotId,
      generateBatch: noop.generateBatch,
      retryGeneration: noop.retryGeneration,
      openMedia: noop.openMedia,
      openFrameEditor: noop.openFrameEditor,
      retryMedia: noop.retryMedia,
      addReferenceAsset: noop.addReferenceAsset,
      removeReferenceAsset: noop.removeReferenceAsset,
      moveShot: noop.moveShot,
      deleteShot: noop.deleteShot,
      createGroup: noop.createGroup,
      dissolveGroup: noop.dissolveGroup,
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: buildStoryboardPreviewTheme(),
        home: StoryboardWorkspaceV2(
          state: StoryboardFixtures.normal,
          actions: actions,
        ),
      ),
    );

    expect(find.text('EP01-SC03-SH001'), findsWidgets);
    await tester.tap(find.byKey(const Key('generate-current-shot')));
    await tester.pump();
    expect(generatedShotId, 'shot-001');
  });

  testWidgets('loading fixture does not render shot collection', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildStoryboardPreviewTheme(),
        home: StoryboardWorkspaceV2(
          state: StoryboardFixtures.loading,
          actions: StoryboardUiActions.noop(),
        ),
      ),
    );

    expect(find.text('正在加载 Storyboard'), findsOneWidget);
    expect(find.byKey(const Key('storyboard-card-grid')), findsNothing);
  });
}
