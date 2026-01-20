import json
import re
from dataclasses import asdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import urlparse, urlunparse


VIDEO_EXTENSIONS = {"mp4", "webm", "m3u8"}


def normalize_url(url: str, aggressive: bool = False) -> Optional[str]:
    if not url:
        return None
    url = url.strip()
    if not url:
        return None
    parsed = urlparse(url)
    if not parsed.scheme:
        parsed = urlparse(f"https://{url}")
    if parsed.scheme not in {"http", "https"}:
        return None
    netloc = parsed.netloc.lower()
    path = re.sub(r"//+", "/", parsed.path or "/")
    query = parsed.query
    if aggressive and query:
        query_parts = sorted(part for part in query.split("&") if part)
        query = "&".join(query_parts)
    normalized = urlunparse(
        (parsed.scheme, netloc, path, parsed.params, query, "")
    )
    return normalized


def is_same_host(target: str, url: str) -> bool:
    try:
        target_host = urlparse(target).netloc.lower()
        url_host = urlparse(url).netloc.lower()
    except ValueError:
        return False
    return target_host == url_host


def dedupe_urls(urls: Iterable[str], aggressive: bool = False) -> List[str]:
    seen: Set[str] = set()
    ordered: List[str] = []
    for url in urls:
        normalized = normalize_url(url, aggressive=aggressive)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(normalized)
    return ordered


def write_jsonl(path: Path, items: Iterable[Dict]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for item in items:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")


def write_lines(path: Path, lines: Iterable[str]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for line in lines:
            handle.write(f"{line}\n")


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def csv_safe(value: Optional[str]) -> str:
    return value or ""


def asset_type_from_url(url: str) -> str:
    parsed = urlparse(url)
    ext = Path(parsed.path).suffix.lower().lstrip(".")
    return ext if ext else "unknown"


def merge_page_metadata(existing: Dict, incoming: Dict) -> Dict:
    merged = dict(existing)
    for key, value in incoming.items():
        if key not in merged or not merged.get(key):
            merged[key] = value
    return merged
