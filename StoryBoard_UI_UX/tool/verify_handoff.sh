#!/usr/bin/env bash
set -euo pipefail

handoff_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if command -v rg >/dev/null 2>&1; then
  forbidden_imports="$(
    rg -n \
      "package:(flutter_riverpod|http|dio|web_socket_channel|shared_preferences)|package:hurricane_studio" \
      "$handoff_root/packages/storyboard_ui_contract/lib" \
      "$handoff_root/packages/storyboard_ui_v2/lib" \
      "$handoff_root/packages/storyboard_ui_foundation/lib" || true
  )"
  if [[ -n "$forbidden_imports" ]]; then
    echo "Forbidden production/integration dependency found:" >&2
    echo "$forbidden_imports" >&2
    exit 1
  fi
fi

pushd "$handoff_root/packages/storyboard_ui_contract" >/dev/null
dart pub get
dart analyze
dart test
popd >/dev/null

for package_dir in storyboard_ui_foundation storyboard_ui_v2; do
  pushd "$handoff_root/packages/$package_dir" >/dev/null
  flutter pub get
  flutter analyze
  flutter test
  popd >/dev/null
done

pushd "$handoff_root/preview/storyboard_ui_preview" >/dev/null
flutter pub get
flutter analyze
flutter test
popd >/dev/null

echo "Storyboard UI handoff verification passed."
