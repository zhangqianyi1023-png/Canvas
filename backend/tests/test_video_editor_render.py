import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import _normalize_video_encoder_dimension


class VideoEditorRenderTest(unittest.TestCase):
    def test_encoder_dimensions_are_even(self):
        self.assertEqual(_normalize_video_encoder_dimension(735, 1280, 320, 3840), 736)
        self.assertEqual(_normalize_video_encoder_dimension(1280, 1280, 320, 3840), 1280)

    def test_encoder_dimensions_stay_within_bounds(self):
        self.assertEqual(_normalize_video_encoder_dimension(3839, 1280, 320, 3840), 3840)
        self.assertEqual(_normalize_video_encoder_dimension(3841, 1280, 320, 3840), 3840)


if __name__ == "__main__":
    unittest.main()
