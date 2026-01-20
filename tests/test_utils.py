import unittest

from app.utils import dedupe_urls, normalize_url


class TestUrlUtils(unittest.TestCase):
    def test_normalize_url_adds_scheme(self) -> None:
        self.assertEqual(
            normalize_url("example.com/video"),
            "https://example.com/video",
        )

    def test_normalize_url_strips_fragment(self) -> None:
        self.assertEqual(
            normalize_url("https://example.com/watch#section"),
            "https://example.com/watch",
        )

    def test_dedupe_urls_respects_aggressive(self) -> None:
        urls = [
            "https://example.com/watch?a=1&b=2",
            "https://example.com/watch?b=2&a=1",
        ]
        self.assertEqual(len(dedupe_urls(urls, aggressive=False)), 2)
        self.assertEqual(len(dedupe_urls(urls, aggressive=True)), 1)


if __name__ == "__main__":
    unittest.main()
