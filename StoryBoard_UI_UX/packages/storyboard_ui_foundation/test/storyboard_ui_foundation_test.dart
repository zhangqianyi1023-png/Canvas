import 'package:flutter_test/flutter_test.dart';
import 'package:storyboard_ui_foundation/storyboard_ui_foundation.dart';

void main() {
  test('preview theme carries storyboard design tokens', () {
    final theme = buildStoryboardPreviewTheme();
    expect(theme.extension<StoryboardDesignTokens>(), isNotNull);
  });
}
