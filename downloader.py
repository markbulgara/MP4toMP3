#!/usr/bin/env python3
"""Near-universal video downloader using yt-dlp."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List


def parse_headers(raw_headers: List[str]) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    for header in raw_headers:
        if ":" not in header:
            raise ValueError(f"Invalid header format: {header}. Use 'Name: Value'.")
        name, value = header.split(":", 1)
        headers[name.strip()] = value.strip()
    return headers


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Download videos from nearly any site using only a URL.",
    )
    parser.add_argument("url", help="Video page URL or direct media URL.")
    parser.add_argument(
        "--output-dir",
        default="downloads",
        help="Directory to save downloads (default: downloads).",
    )
    parser.add_argument(
        "--format",
        dest="format_selector",
        default="bestvideo+bestaudio/best",
        help="yt-dlp format selector (default: bestvideo+bestaudio/best).",
    )
    parser.add_argument(
        "--audio-only",
        action="store_true",
        help="Download audio only and extract to the best available format.",
    )
    parser.add_argument(
        "--cookies",
        type=Path,
        help="Path to a cookies.txt file for authenticated downloads.",
    )
    parser.add_argument(
        "--header",
        action="append",
        default=[],
        help="Custom request header in 'Name: Value' format. Can be repeated.",
    )
    parser.add_argument(
        "--referer",
        help="Set a Referer header (some sites require the page URL).",
    )
    parser.add_argument(
        "--user-agent",
        help="Set a custom User-Agent header to mimic a browser.",
    )
    parser.add_argument(
        "--headers-json",
        type=Path,
        help="Path to a JSON file containing additional headers.",
    )
    return parser


def load_json_headers(path: Path | None) -> Dict[str, str]:
    if not path:
        return {}
    data = json.loads(path.read_text())
    if not isinstance(data, dict):
        raise ValueError("Headers JSON must be an object of name/value pairs.")
    return {str(key): str(value) for key, value in data.items()}


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        from yt_dlp import YoutubeDL
    except ModuleNotFoundError:  # pragma: no cover
        parser.error("yt-dlp is required. Install it with: pip install -r requirements.txt")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    headers = {}
    headers.update(load_json_headers(args.headers_json))
    headers.update(parse_headers(args.header))
    if args.referer:
        headers.setdefault("Referer", args.referer)
    if args.user_agent:
        headers.setdefault("User-Agent", args.user_agent)

    ydl_opts = {
        "outtmpl": str(output_dir / "%(title)s.%(ext)s"),
        "format": args.format_selector,
        "noplaylist": True,
        "quiet": False,
        "no_warnings": False,
    }

    if headers:
        ydl_opts["http_headers"] = headers

    if args.cookies:
        ydl_opts["cookiefile"] = str(args.cookies)

    if args.audio_only:
        ydl_opts.update(
            {
                "format": "bestaudio/best",
                "postprocessors": [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "192",
                    }
                ],
            }
        )

    with YoutubeDL(ydl_opts) as ydl:
        ydl.download([args.url])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
