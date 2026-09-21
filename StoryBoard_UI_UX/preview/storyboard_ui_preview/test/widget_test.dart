import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:storyboard_ui_preview/main.dart';

void main() {
  testWidgets('preview exposes scenario selector and callback recorder', (
    tester,
  ) async {
    await tester.pumpWidget(const StoryboardPreviewApp());

    expect(find.byKey(const Key('preview-title')), findsOneWidget);
    expect(find.byKey(const Key('fixture-selector')), findsOneWidget);
    expect(find.textContaining('Callback Recorder'), findsOneWidget);
  });
}
