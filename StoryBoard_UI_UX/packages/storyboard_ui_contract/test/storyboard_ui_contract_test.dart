import 'package:storyboard_ui_contract/storyboard_ui_contract.dart';
import 'package:storyboard_ui_contract/storyboard_ui_fixtures.dart';
import 'package:test/test.dart';

void main() {
  test('normal fixture has a selected shot', () {
    expect(StoryboardFixtures.normal.primarySelectedShot?.id, 'shot-001');
    expect(StoryboardFixtures.normal.permission.canWrite, isTrue);
  });

  test('all fixture scenarios resolve without production dependencies', () {
    for (final scenario in StoryboardFixtureScenario.values) {
      expect(
        StoryboardFixtures.forScenario(scenario),
        isA<StoryboardUiState>(),
      );
    }
  });

  test('noop actions are callable', () async {
    final actions = StoryboardUiActions.noop();
    actions.selectShot('shot-001');
    await actions.generateShot('shot-001');
  });
}
