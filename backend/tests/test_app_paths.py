import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app_paths import resolve_app_paths


class AppPathsTest(unittest.TestCase):
    def test_defaults_to_backend_local_storage(self):
        with tempfile.TemporaryDirectory() as temporary:
            backend_dir = Path(temporary) / "backend"

            with patch.dict(os.environ, {}, clear=True):
                paths = resolve_app_paths(backend_dir=backend_dir)

            self.assertEqual(paths.data_root, backend_dir.resolve())
            self.assertEqual(paths.upload_dir, backend_dir.resolve() / "uploads")
            self.assertEqual(paths.admin_data_dir, backend_dir.resolve() / "data")

    def test_data_root_comes_from_environment(self):
        with tempfile.TemporaryDirectory() as temporary:
            backend_dir = Path(temporary) / "backend"
            configured_dir = Path(temporary) / "InUx Canvas"

            with patch.dict(os.environ, {"INUX_DATA_DIR": str(configured_dir)}, clear=True):
                paths = resolve_app_paths(backend_dir=backend_dir)

            self.assertEqual(paths.data_root, configured_dir.resolve())
            self.assertEqual(paths.upload_dir, configured_dir.resolve() / "uploads")
            self.assertEqual(paths.admin_data_dir, configured_dir.resolve() / "data")

    def test_explicit_data_root_wins_over_environment(self):
        with tempfile.TemporaryDirectory() as temporary:
            backend_dir = Path(temporary) / "backend"
            explicit_dir = Path(temporary) / "explicit"

            with patch.dict(os.environ, {"INUX_DATA_DIR": str(Path(temporary) / "ignored")}, clear=True):
                paths = resolve_app_paths(data_dir=str(explicit_dir), backend_dir=backend_dir)

            self.assertEqual(paths.data_root, explicit_dir.resolve())


if __name__ == "__main__":
    unittest.main()
