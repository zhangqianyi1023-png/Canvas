import 'package:flutter/material.dart';
import 'package:storyboard_ui_contract/storyboard_ui_contract.dart';
import 'package:storyboard_ui_contract/storyboard_ui_fixtures.dart';
import 'package:storyboard_ui_foundation/storyboard_ui_foundation.dart';
import 'package:storyboard_ui_v2/storyboard_ui_v2.dart';

void main() {
  runApp(const StoryboardPreviewApp());
}

class StoryboardPreviewApp extends StatelessWidget {
  const StoryboardPreviewApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Storyboard UI Preview',
      debugShowCheckedModeBanner: false,
      theme: buildStoryboardPreviewTheme(),
      home: const StoryboardPreviewShell(),
    );
  }
}

class StoryboardPreviewShell extends StatefulWidget {
  const StoryboardPreviewShell({super.key});

  @override
  State<StoryboardPreviewShell> createState() => _StoryboardPreviewShellState();
}

class _StoryboardPreviewShellState extends State<StoryboardPreviewShell> {
  StoryboardFixtureScenario _scenario = StoryboardFixtureScenario.normal;
  late StoryboardUiState _state = StoryboardFixtures.forScenario(_scenario);
  final List<String> _events = [];

  void _record(String message) {
    setState(() {
      _events.insert(0, message);
      if (_events.length > 40) _events.removeLast();
    });
  }

  StoryboardUiActions get _actions => StoryboardUiActions(
    retryWorkspace: () => _record('retryWorkspace()'),
    changeScene: (sceneId) => _record('changeScene($sceneId)'),
    changeFrameMode: (mode) {
      _record('changeFrameMode(${mode.name})');
      setState(() => _state = _state.copyWith(frameMode: mode));
    },
    changeViewMode: (mode) {
      _record('changeViewMode(${mode.name})');
      setState(() => _state = _state.copyWith(viewMode: mode));
    },
    selectShot: (shotId, {extendSelection = false}) {
      _record('selectShot($shotId, extend=$extendSelection)');
      final nextSelection = extendSelection
          ? {..._state.selectedShotIds, shotId}
          : {shotId};
      setState(
        () => _state = _state.copyWith(
          selectedShotIds: nextSelection,
          primarySelectedShotId: shotId,
        ),
      );
    },
    activateShot: (shotId) => _record('activateShot($shotId)'),
    setDetailPanelOpen: (isOpen) {
      _record('setDetailPanelOpen($isOpen)');
      setState(
        () => _state = _state.copyWith(
          detailPanel: StoryboardDetailPanelUiModel(
            isOpen: isOpen,
            widthFraction: _state.detailPanel.widthFraction,
            minimumFraction: _state.detailPanel.minimumFraction,
            maximumFraction: _state.detailPanel.maximumFraction,
          ),
        ),
      );
    },
    setDetailPanelFraction: (fraction) {
      _record('setDetailPanelFraction($fraction)');
      setState(
        () => _state = _state.copyWith(
          detailPanel: StoryboardDetailPanelUiModel(
            isOpen: _state.detailPanel.isOpen,
            widthFraction: fraction,
            minimumFraction: _state.detailPanel.minimumFraction,
            maximumFraction: _state.detailPanel.maximumFraction,
          ),
        ),
      );
    },
    updateImagePrompt: (shotId, value) =>
        _record('updateImagePrompt($shotId, ${value.length} chars)'),
    updateVideoPrompt: (shotId, value) =>
        _record('updateVideoPrompt($shotId, ${value.length} chars)'),
    saveShot: (shotId) async => _record('saveShot($shotId)'),
    generateShot: (shotId) async => _record('generateShot($shotId)'),
    generateBatch: (shotIds) async =>
        _record('generateBatch(${shotIds.join(',')})'),
    retryGeneration: (shotId) async => _record('retryGeneration($shotId)'),
    openMedia: (shotId, mediaId) => _record('openMedia($shotId, $mediaId)'),
    openFrameEditor: (shotId, target) =>
        _record('openFrameEditor($shotId, ${target.name})'),
    retryMedia: (shotId, mediaId) => _record('retryMedia($shotId, $mediaId)'),
    addReferenceAsset: (shotId) async => _record('addReferenceAsset($shotId)'),
    removeReferenceAsset: (shotId, assetId) async =>
        _record('removeReferenceAsset($shotId, $assetId)'),
    moveShot: (shotId, sceneId) async => _record('moveShot($shotId, $sceneId)'),
    deleteShot: (shotId) async => _record('deleteShot($shotId)'),
    createGroup: (shotIds) async =>
        _record('createGroup(${shotIds.join(',')})'),
    dissolveGroup: (groupId) async => _record('dissolveGroup($groupId)'),
  );

  void _selectScenario(StoryboardFixtureScenario scenario) {
    setState(() {
      _scenario = scenario;
      _state = StoryboardFixtures.forScenario(scenario);
      _events.insert(0, 'fixture: ${scenario.name}');
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          _PreviewToolbar(
            scenario: _scenario,
            onScenarioChanged: _selectScenario,
            onClearEvents: () => setState(_events.clear),
          ),
          Expanded(
            child: StoryboardWorkspaceV2(state: _state, actions: _actions),
          ),
          _CallbackLog(events: _events),
        ],
      ),
    );
  }
}

class _PreviewToolbar extends StatelessWidget {
  const _PreviewToolbar({
    required this.scenario,
    required this.onScenarioChanged,
    required this.onClearEvents,
  });

  final StoryboardFixtureScenario scenario;
  final ValueChanged<StoryboardFixtureScenario> onScenarioChanged;
  final VoidCallback onClearEvents;

  @override
  Widget build(BuildContext context) {
    final tokens = context.storyboardTokens;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tokens.panelRaised,
        border: Border(bottom: BorderSide(color: tokens.border)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Row(
          children: [
            const Icon(Icons.science_outlined, size: 18),
            const SizedBox(width: 8),
            const Text(
              'Storyboard UI Preview · 非生产环境',
              key: Key('preview-title'),
            ),
            const Spacer(),
            const Text('Fixture：'),
            const SizedBox(width: 6),
            DropdownButton<StoryboardFixtureScenario>(
              key: const Key('fixture-selector'),
              value: scenario,
              underline: const SizedBox.shrink(),
              onChanged: (value) {
                if (value != null) onScenarioChanged(value);
              },
              items: StoryboardFixtureScenario.values
                  .map(
                    (item) =>
                        DropdownMenuItem(value: item, child: Text(item.label)),
                  )
                  .toList(growable: false),
            ),
            const SizedBox(width: 8),
            Tooltip(
              message: '清空 Callback 日志',
              child: IconButton(
                onPressed: onClearEvents,
                icon: const Icon(Icons.delete_sweep_outlined),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CallbackLog extends StatelessWidget {
  const _CallbackLog({required this.events});

  final List<String> events;

  @override
  Widget build(BuildContext context) {
    final tokens = context.storyboardTokens;
    return SizedBox(
      height: 112,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: tokens.panelRaised,
          border: Border(top: BorderSide(color: tokens.border)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: events.isEmpty
              ? Text(
                  'Callback Recorder：操作新 UI 后，业务意图会显示在这里。',
                  style: Theme.of(context).textTheme.bodySmall,
                )
              : ListView.builder(
                  itemCount: events.length,
                  itemBuilder: (context, index) => Text(
                    events[index],
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
        ),
      ),
    );
  }
}

extension on StoryboardFixtureScenario {
  String get label => switch (this) {
    StoryboardFixtureScenario.normal => '正常',
    StoryboardFixtureScenario.empty => '空数据',
    StoryboardFixtureScenario.loading => '加载中',
    StoryboardFixtureScenario.error => '加载失败',
    StoryboardFixtureScenario.readOnly => '只读',
    StoryboardFixtureScenario.generating => '生成中',
    StoryboardFixtureScenario.failedGeneration => '生成失败',
    StoryboardFixtureScenario.largeProject => '大量镜头',
  };
}
