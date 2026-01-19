#!/usr/bin/env python3
"""
Universal Site Video Grid

Usage examples:
  python universal_site_video_grid.py --base https://example.com
  python universal_site_video_grid.py --base https://example.com --max-pages 500 --concurrency 8 --delay 0.2
  python universal_site_video_grid.py --base https://example.com --use-playwright always --out report.html
  python universal_site_video_grid.py --gui
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import sys
import time
import threading
from dataclasses import dataclass, field
from html import escape
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import parse_qsl, urljoin, urlparse, urlunparse, urlencode

import httpx
from bs4 import BeautifulSoup
from lxml import etree
from playwright.async_api import async_playwright, Browser, Page

USER_AGENT_DEFAULT = "UniversalVideoCrawler/1.0"

SKIP_EXTENSIONS = {
    ".pdf",
    ".zip",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".mp4",
    ".mp3",
    ".mov",
    ".avi",
    ".mkv",
    ".webm",
    ".css",
    ".js",
    ".ico",
    ".xml",
}

SKIP_PATH_PATTERNS = [
    re.compile(r"/logout", re.I),
    re.compile(r"/admin", re.I),
    re.compile(r"/login", re.I),
    re.compile(r"/calendar", re.I),
    re.compile(r"/cart", re.I),
    re.compile(r"/checkout", re.I),
]

PROVIDER_PATTERNS = {
    "youtube": [
        re.compile(r"youtube\.com/watch\?v=([\w-]+)", re.I),
        re.compile(r"youtube\.com/embed/([\w-]+)", re.I),
        re.compile(r"youtu\.be/([\w-]+)", re.I),
    ],
    "vimeo": [
        re.compile(r"vimeo\.com/(\d+)", re.I),
        re.compile(r"player\.vimeo\.com/video/(\d+)", re.I),
    ],
    "dailymotion": [
        re.compile(r"dailymotion\.com/video/([\w-]+)", re.I),
        re.compile(r"dailymotion\.com/embed/video/([\w-]+)", re.I),
    ],
    "twitch": [
        re.compile(r"player\.twitch\.tv", re.I),
        re.compile(r"twitch\.tv/videos/(\d+)", re.I),
    ],
    "facebook": [
        re.compile(r"facebook\.com/.+/videos/([\d]+)", re.I),
        re.compile(r"facebook\.com/video.php\?v=([\d]+)", re.I),
    ],
    "wistia": [
        re.compile(r"wistia\.net/embed/iframe/([\w-]+)", re.I),
        re.compile(r"wistia\.net/medias/([\w-]+)", re.I),
    ],
    "brightcove": [
        re.compile(r"brightcove\.net", re.I),
    ],
    "tiktok": [
        re.compile(r"tiktok\.com/@.+/video/(\d+)", re.I),
    ],
    "instagram": [
        re.compile(r"instagram\.com/(p|reel|tv)/([\w-]+)", re.I),
    ],
}


@dataclass
class FetchResult:
    url: str
    status_code: Optional[int]
    content_type: Optional[str]
    text: Optional[str]


@dataclass
class VideoItem:
    provider: str
    video_url: str
    embed_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    title: Optional[str] = None
    source: str = ""


@dataclass
class PageResult:
    page_url: str
    canonical_url: Optional[str] = None
    page_title: Optional[str] = None
    description: Optional[str] = None
    keywords: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    matched_keywords: List[str] = field(default_factory=list)
    video_items: List[VideoItem] = field(default_factory=list)
    chosen_thumbnail_url: Optional[str] = None
    chosen_video_url: Optional[str] = None
    fetch_mode: str = "http"
    http_status: Optional[int] = None
    content_type: Optional[str] = None
    badges: List[str] = field(default_factory=list)

@dataclass
class CacheEntry:
    keywords: List[str]
    matched: bool
    timestamp: float


def load_cache(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return {"urls": {}, "domains": {}}
    except Exception:
        return {"urls": {}, "domains": {}}


def save_cache(path: str, cache: Dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(cache, handle, indent=2)


def should_skip_url(
    url: str,
    cache: Dict[str, Any],
    keyword_targets: List[str],
    skip_known_misses: bool,
) -> bool:
    if not skip_known_misses or not keyword_targets:
        return False
    entry = cache.get("urls", {}).get(url)
    if not entry:
        return False
    cached_keywords = entry.get("keywords", [])
    cached_matched = entry.get("matched")
    return cached_keywords == sorted(keyword_targets) and not cached_matched

class RateLimiter:
    def __init__(self, delay: float) -> None:
        self.delay = delay
        self._lock = asyncio.Lock()
        self._next_allowed = time.monotonic()

    async def wait(self) -> None:
        async with self._lock:
            now = time.monotonic()
            if now < self._next_allowed:
                await asyncio.sleep(self._next_allowed - now)
            self._next_allowed = time.monotonic() + self.delay


class RobotsRules:
    def __init__(self, rules: List[Tuple[str, str]]) -> None:
        self.rules = rules

    def allowed(self, path: str) -> bool:
        if not self.rules:
            return True
        matched = [rule for rule in self.rules if path.startswith(rule[0])]
        if not matched:
            return True
        matched.sort(key=lambda r: len(r[0]), reverse=True)
        return matched[0][1] == "allow"


def normalize_url(url: str) -> Optional[str]:
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    if not parsed.scheme:
        return None
    if parsed.scheme not in {"http", "https"}:
        return None
    netloc = parsed.netloc.lower()
    path = re.sub(r"/+$", "/", parsed.path or "/")
    path = re.sub(r"//+", "/", path)
    query = parse_qsl(parsed.query, keep_blank_values=True)
    filtered_query = []
    for key, value in query:
        key_lower = key.lower()
        if key_lower.startswith("utm_") or key_lower in {"gclid", "fbclid"}:
            continue
        filtered_query.append((key, value))
    if len(filtered_query) > 4:
        return None
    if len(parsed.query) > 120:
        return None
    query_str = urlencode(filtered_query, doseq=True)
    normalized = urlunparse(
        (
            parsed.scheme.lower(),
            netloc,
            path,
            "",
            query_str,
            "",
        )
    )
    return normalized


def in_scope(url: str, base_host: str, include_subdomains: bool) -> bool:
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return False
    if include_subdomains:
        return host == base_host or host.endswith("." + base_host)
    return host == base_host


def is_skippable(url: str) -> bool:
    parsed = urlparse(url)
    for pattern in SKIP_PATH_PATTERNS:
        if pattern.search(parsed.path):
            return True
    lower_path = parsed.path.lower()
    for ext in SKIP_EXTENSIONS:
        if lower_path.endswith(ext):
            return True
    return False


def extract_sitemap_locations(xml_text: str) -> List[str]:
    try:
        root = etree.fromstring(xml_text.encode("utf-8"))
    except Exception:
        return []
    nsmap = {k if k is not None else "ns": v for k, v in root.nsmap.items()}
    urls = []
    if root.tag.endswith("sitemapindex"):
        for loc in root.findall(".//ns:loc", namespaces=nsmap):
            if loc.text:
                urls.append(loc.text.strip())
    elif root.tag.endswith("urlset"):
        for loc in root.findall(".//ns:loc", namespaces=nsmap):
            if loc.text:
                urls.append(loc.text.strip())
    return urls


def parse_robots(text: str) -> RobotsRules:
    rules: List[Tuple[str, str]] = []
    current_agent: Optional[str] = None
    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        if line.lower().startswith("user-agent:"):
            current_agent = line.split(":", 1)[1].strip()
            continue
        if current_agent not in {"*", USER_AGENT_DEFAULT}:
            continue
        if line.lower().startswith("disallow:"):
            path = line.split(":", 1)[1].strip()
            if not path:
                continue
            rules.append((path, "disallow"))
        if line.lower().startswith("allow:"):
            path = line.split(":", 1)[1].strip()
            if not path:
                continue
            rules.append((path, "allow"))
    return RobotsRules(rules)


def find_tags(soup: BeautifulSoup) -> List[str]:
    tags: Set[str] = set()
    for link in soup.find_all("a", href=True):
        href = link.get("href") or ""
        text = (link.get_text() or "").strip()
        if not text:
            continue
        if "/tag/" in href or "/tags/" in href:
            tags.add(text)
    return sorted(tags)


def parse_json_ld(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    scripts = soup.find_all("script", attrs={"type": "application/ld+json"})
    for script in scripts:
        if not script.string:
            continue
        try:
            data = json.loads(script.string)
        except json.JSONDecodeError:
            continue
        extracted = extract_video_objects(data)
        items.extend(extracted)
    return items


def extract_video_objects(data: Any) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    if isinstance(data, list):
        for item in data:
            items.extend(extract_video_objects(item))
    elif isinstance(data, dict):
        if data.get("@type") == "VideoObject":
            items.append(data)
        if "@graph" in data:
            items.extend(extract_video_objects(data["@graph"]))
        for value in data.values():
            if isinstance(value, (dict, list)):
                items.extend(extract_video_objects(value))
    return items


def extract_meta(soup: BeautifulSoup) -> Dict[str, Any]:
    meta: Dict[str, Any] = {}
    if soup.title and soup.title.string:
        meta["title"] = soup.title.string.strip()
    for tag in soup.find_all("meta"):
        name = tag.get("name") or tag.get("property")
        if not name:
            continue
        content = tag.get("content")
        if not content:
            continue
        meta[name.lower()] = content.strip()
    return meta


def extract_text_content(soup: BeautifulSoup) -> str:
    for element in soup(["script", "style", "noscript"]):
        element.decompose()
    return " ".join(soup.stripped_strings)


def find_keyword_matches(text: str, candidates: Iterable[str]) -> List[str]:
    matches: List[str] = []
    lowered = text.lower()
    for keyword in candidates:
        clean = keyword.strip()
        if not clean:
            continue
        if re.search(rf"\\b{re.escape(clean.lower())}\\b", lowered):
            matches.append(clean)
    return sorted(set(matches))


def quick_keyword_matches(html: str, candidates: Iterable[str]) -> List[str]:
    if not candidates:
        return []
    lowered = html.lower()
    matches: List[str] = []
    for keyword in candidates:
        clean = keyword.strip()
        if not clean:
            continue
        if clean.lower() in lowered:
            matches.append(clean)
    return sorted(set(matches))


def resolve_url(base: str, url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    return urljoin(base, url)


def youtube_thumbnail(video_id: str) -> str:
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


def parse_provider(url: str) -> Tuple[str, Optional[str], Optional[str]]:
    for provider, patterns in PROVIDER_PATTERNS.items():
        for pattern in patterns:
            match = pattern.search(url)
            if match:
                video_id = match.group(1) if match.groups() else None
                if provider == "youtube" and video_id:
                    watch = f"https://www.youtube.com/watch?v={video_id}"
                    return provider, watch, youtube_thumbnail(video_id)
                if provider == "vimeo" and video_id:
                    watch = f"https://vimeo.com/{video_id}"
                    return provider, watch, None
                return provider, url, None
    return "unknown", url, None


def detect_spa_signals(html: str) -> bool:
    indicators = [
        "__NEXT_DATA__",
        "data-reactroot",
        "id=\"root\"",
        "id=\"__next\"",
        "ng-app",
    ]
    for indicator in indicators:
        if indicator in html:
            return True
    script_count = html.count("<script")
    text_density = len(re.sub(r"<[^>]+>", "", html).strip())
    if script_count > 8 and text_density < 200:
        return True
    return False


def extract_videos_from_html(soup: BeautifulSoup, base_url: str) -> List[VideoItem]:
    items: List[VideoItem] = []
    for video in soup.find_all("video"):
        poster = resolve_url(base_url, video.get("poster"))
        src = video.get("src")
        if not src:
            source_tag = video.find("source", src=True)
            if source_tag:
                src = source_tag.get("src")
        if src:
            items.append(
                VideoItem(
                    provider="html5",
                    video_url=resolve_url(base_url, src) or src,
                    thumbnail_url=poster,
                    source="video",
                )
            )
    for frame in soup.find_all("iframe", src=True):
        src = resolve_url(base_url, frame.get("src"))
        if not src:
            continue
        provider, video_url, thumb = parse_provider(src)
        items.append(
            VideoItem(
                provider=provider,
                video_url=video_url,
                embed_url=src,
                thumbnail_url=thumb,
                source="iframe",
            )
        )
    return items


def extract_video_links(soup: BeautifulSoup, base_url: str) -> List[VideoItem]:
    items: List[VideoItem] = []
    for link in soup.find_all("a", href=True):
        href = resolve_url(base_url, link.get("href"))
        if not href:
            continue
        provider, video_url, thumb = parse_provider(href)
        if provider != "unknown":
            items.append(
                VideoItem(
                    provider=provider,
                    video_url=video_url,
                    embed_url=None,
                    thumbnail_url=thumb,
                    source="link",
                )
            )
    return items


async def fetch_oembed(client: httpx.AsyncClient, video_url: str, provider: str) -> Optional[str]:
    endpoints = {
        "youtube": "https://www.youtube.com/oembed",
        "vimeo": "https://vimeo.com/api/oembed.json",
    }
    endpoint = endpoints.get(provider)
    if not endpoint:
        return None
    try:
        response = await client.get(endpoint, params={"url": video_url, "format": "json"})
        response.raise_for_status()
    except Exception:
        return None
    try:
        data = response.json()
    except Exception:
        return None
    return data.get("thumbnail_url")


async def fetch_url(
    client: httpx.AsyncClient,
    url: str,
    limiter: RateLimiter,
    semaphore: asyncio.Semaphore,
    timeout: float,
) -> FetchResult:
    await limiter.wait()
    async with semaphore:
        try:
            response = await client.get(url, timeout=timeout)
        except Exception:
            return FetchResult(url=url, status_code=None, content_type=None, text=None)
    content_type = response.headers.get("content-type")
    text = None
    if content_type and "text/html" in content_type:
        text = response.text
    return FetchResult(url=url, status_code=response.status_code, content_type=content_type, text=text)


async def render_with_playwright(page: Page, url: str, timeout: float) -> Optional[str]:
    try:
        await page.goto(url, wait_until="networkidle", timeout=int(timeout * 1000))
        await asyncio.sleep(0.5)
        return await page.content()
    except Exception:
        return None


def choose_thumbnail(
    video_items: List[VideoItem],
    meta: Dict[str, Any],
    json_ld: List[Dict[str, Any]],
    base_url: str,
) -> Tuple[Optional[str], List[str]]:
    badges = []
    for obj in json_ld:
        thumb = obj.get("thumbnailUrl")
        if thumb:
            badges.append("schema")
            if isinstance(thumb, list):
                return resolve_url(base_url, thumb[0]), badges
            return resolve_url(base_url, thumb), badges
    for item in video_items:
        if item.thumbnail_url:
            badges.append(item.source)
            return resolve_url(base_url, item.thumbnail_url), badges
    og_image = meta.get("og:image") or meta.get("twitter:image")
    if og_image:
        badges.append("og")
        return resolve_url(base_url, og_image), badges
    return None, badges


def choose_video_url(video_items: List[VideoItem]) -> Optional[str]:
    if video_items:
        return video_items[0].video_url
    return None


def build_page_result(
    url: str,
    html: str,
    fetch_mode: str,
    status_code: Optional[int],
    content_type: Optional[str],
    keyword_targets: List[str],
) -> PageResult:
    soup = BeautifulSoup(html, "lxml")
    meta = extract_meta(soup)
    json_ld = parse_json_ld(soup)
    canonical_tag = soup.find("link", rel="canonical")
    canonical_url = None
    if canonical_tag and canonical_tag.get("href"):
        canonical_url = resolve_url(url, canonical_tag.get("href"))

    keywords = []
    if meta.get("keywords"):
        keywords.extend([k.strip() for k in meta["keywords"].split(",") if k.strip()])
    if meta.get("news_keywords"):
        keywords.extend([k.strip() for k in meta["news_keywords"].split(",") if k.strip()])

    for obj in json_ld:
        kw = obj.get("keywords")
        if isinstance(kw, str):
            keywords.extend([k.strip() for k in kw.split(",") if k.strip()])
        elif isinstance(kw, list):
            keywords.extend([str(k).strip() for k in kw if str(k).strip()])

    tags = find_tags(soup)
    text_content = extract_text_content(soup)
    keyword_matches = find_keyword_matches(
        " ".join([text_content, " ".join(tags), " ".join(keywords)]),
        keyword_targets,
    )

    video_items: List[VideoItem] = []
    for obj in json_ld:
        if obj.get("@type") == "VideoObject":
            video_url = obj.get("contentUrl") or obj.get("embedUrl") or url
            embed_url = obj.get("embedUrl")
            thumb = obj.get("thumbnailUrl")
            if isinstance(thumb, list):
                thumb = thumb[0] if thumb else None
            video_items.append(
                VideoItem(
                    provider="schema",
                    video_url=resolve_url(url, video_url) or video_url,
                    embed_url=resolve_url(url, embed_url) if embed_url else None,
                    thumbnail_url=resolve_url(url, thumb) if thumb else None,
                    title=obj.get("name"),
                    source="schema",
                )
            )

    og_video = meta.get("og:video") or meta.get("og:video:url") or meta.get("og:video:secure_url")
    if og_video:
        video_items.append(
            VideoItem(
                provider="og",
                video_url=resolve_url(url, og_video) or og_video,
                embed_url=resolve_url(url, og_video) or og_video,
                thumbnail_url=resolve_url(url, meta.get("og:image")) if meta.get("og:image") else None,
                title=meta.get("og:title"),
                source="og",
            )
        )
    twitter_player = meta.get("twitter:player")
    if twitter_player:
        video_items.append(
            VideoItem(
                provider="twitter",
                video_url=resolve_url(url, twitter_player) or twitter_player,
                embed_url=resolve_url(url, twitter_player) or twitter_player,
                thumbnail_url=resolve_url(url, meta.get("twitter:image")) if meta.get("twitter:image") else None,
                title=meta.get("twitter:title"),
                source="twitter",
            )
        )

    video_items.extend(extract_videos_from_html(soup, url))
    if not video_items:
        video_items.extend(extract_video_links(soup, url))

    thumb, badges = choose_thumbnail(video_items, meta, json_ld, url)

    result = PageResult(
        page_url=url,
        canonical_url=canonical_url,
        page_title=meta.get("title") or meta.get("og:title") or meta.get("twitter:title"),
        description=meta.get("description")
        or meta.get("og:description")
        or meta.get("twitter:description"),
        keywords=sorted(set(keywords)),
        tags=tags,
        matched_keywords=keyword_matches,
        video_items=video_items,
        chosen_thumbnail_url=thumb,
        chosen_video_url=choose_video_url(video_items),
        fetch_mode=fetch_mode,
        http_status=status_code,
        content_type=content_type,
        badges=badges,
    )
    if keyword_matches:
        result.badges.append("keyword")
    return result


def page_needs_playwright(html: str, meta: Dict[str, Any]) -> bool:
    if detect_spa_signals(html):
        return True
    has_meta = any(
        key in meta
        for key in [
            "og:title",
            "og:description",
            "og:image",
            "twitter:title",
            "twitter:description",
        ]
    )
    if not has_meta and len(html.strip()) > 400:
        return True
    return False


def render_html_report(results: List[PageResult], stats: Dict[str, Any], output_path: str) -> None:
    cards = []
    placeholder = (
        "data:image/svg+xml;utf8,"
        "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>"
        "<rect width='100%' height='100%' fill='%23e5e7eb'/>"
        "<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' "
        "fill='%236b7280' font-family='Arial' font-size='20'>No thumbnail</text>"
        "</svg>"
    )
    for result in results:
        thumb = result.chosen_thumbnail_url or placeholder
        title = result.page_title or result.page_url
        keywords = ", ".join(result.keywords or result.tags)
        matched = ", ".join(result.matched_keywords)
        badges = " ".join(f"<span class=\"badge\">{escape(b)}</span>" for b in result.badges)
        video_urls = "<br>".join(
            escape(item.video_url)
            for item in result.video_items[:2]
            if item.video_url
        )
        if not video_urls and result.matched_keywords:
            video_urls = "<em>No video detected</em>"
        cards.append(
            f"""
            <div class=\"card\" data-search=\"{escape((title + ' ' + result.page_url + ' ' + keywords + ' ' + matched).lower())}\">
                <a href=\"{escape(result.page_url)}\" target=\"_blank\">
                    <img src=\"{escape(thumb)}\" alt=\"thumbnail\" loading=\"lazy\">
                </a>
                <div class=\"card-body\">
                    <h3>{escape(title)}</h3>
                    <p class=\"url\"><a href=\"{escape(result.page_url)}\" target=\"_blank\">{escape(result.page_url)}</a></p>
                    <p class=\"videos\">{video_urls}</p>
                    <p class=\"keywords\">{escape(keywords)}</p>
                    <p class=\"keywords\">{escape(matched)}</p>
                    <div class=\"badges\">{badges}</div>
                </div>
            </div>
            """
        )

    html = f"""
<!DOCTYPE html>
<html lang=\"en\">
<head>
<meta charset=\"UTF-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
<title>Video Grid Report</title>
<style>
body {{ font-family: Arial, sans-serif; margin: 0; background: #f6f7fb; color: #222; }}
header {{ padding: 20px; background: #1f2937; color: #fff; }}
header h1 {{ margin: 0 0 10px; font-size: 24px; }}
header p {{ margin: 4px 0; }}
.search {{ margin-top: 10px; }}
.search input {{ width: 100%; max-width: 400px; padding: 8px; border-radius: 6px; border: 1px solid #ccc; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; padding: 20px; }}
.card {{ background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.08); display: flex; flex-direction: column; }}
.card img {{ width: 100%; height: 180px; object-fit: cover; background: #ddd; }}
.card-body {{ padding: 12px 14px 16px; }}
.card h3 {{ margin: 0 0 6px; font-size: 16px; }}
.card .url {{ font-size: 12px; word-break: break-all; }}
.card .videos {{ font-size: 12px; color: #374151; word-break: break-all; }}
.card .keywords {{ font-size: 12px; color: #6b7280; }}
.badges {{ margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }}
.badge {{ background: #eef2ff; color: #3730a3; border-radius: 999px; padding: 2px 8px; font-size: 11px; }}
</style>
</head>
<body>
<header>
  <h1>Video Grid Report</h1>
  <p>Pages discovered: {stats.get('discovered')}</p>
  <p>Pages fetched: {stats.get('fetched')}</p>
  <p>Rendered with Playwright: {stats.get('playwright')}</p>
  <p>Pages with videos: {stats.get('with_videos')}</p>
  <p>Keyword matches: {stats.get('keyword_matches')}</p>
  <p><a href="report.json" style="color:#93c5fd;">Download JSON</a></p>
  <div class=\"search\">
    <input id=\"search\" type=\"text\" placeholder=\"Search by title, URL, keywords...\">
  </div>
</header>
<section class=\"grid\" id=\"grid\">
  {"".join(cards)}
</section>
<script>
const search = document.getElementById('search');
const cards = Array.from(document.querySelectorAll('.card'));
search.addEventListener('input', () => {{
  const term = search.value.toLowerCase();
  cards.forEach(card => {{
    const hay = card.getAttribute('data-search');
    card.style.display = hay.includes(term) ? 'flex' : 'none';
  }});
}});
</script>
</body>
</html>
"""
    with open(output_path, "w", encoding="utf-8") as handle:
        handle.write(html)


async def discover_urls(
    client: httpx.AsyncClient,
    base_url: str,
    max_pages: int,
    include_subdomains: bool,
    robots: RobotsRules,
    max_depth: int,
    limiter: RateLimiter,
    semaphore: asyncio.Semaphore,
    timeout: float,
) -> List[str]:
    base_host = urlparse(base_url).netloc.lower()
    urls: List[str] = []
    seen: Set[str] = set()

    async def add_url(candidate: str) -> None:
        normalized = normalize_url(candidate)
        if not normalized:
            return
        if not in_scope(normalized, base_host, include_subdomains):
            return
        if is_skippable(normalized):
            return
        path = urlparse(normalized).path or "/"
        if not robots.allowed(path):
            return
        if normalized in seen:
            return
        seen.add(normalized)
        urls.append(normalized)

    await add_url(base_url)

    sitemap_urls = await get_sitemap_urls(
        client,
        base_url,
        include_subdomains,
        robots,
        limiter,
        semaphore,
        timeout,
        max_pages,
    )
    for item in sitemap_urls:
        await add_url(item)
        if len(urls) >= max_pages:
            break

    if len(urls) < 20:
        await bfs_crawl(
            client,
            base_url,
            include_subdomains,
            robots,
            max_depth,
            limiter,
            semaphore,
            timeout,
            max_pages,
            urls,
            seen,
        )
    return urls[:max_pages]


async def get_sitemap_urls(
    client: httpx.AsyncClient,
    base_url: str,
    include_subdomains: bool,
    robots: RobotsRules,
    limiter: RateLimiter,
    semaphore: asyncio.Semaphore,
    timeout: float,
    max_pages: int,
) -> List[str]:
    base_host = urlparse(base_url).netloc.lower()
    sitemap_candidates: List[str] = []
    robots_url = urljoin(base_url, "/robots.txt")
    robots_result = await fetch_url(client, robots_url, limiter, semaphore, timeout)
    if robots_result.text:
        for line in robots_result.text.splitlines():
            if line.lower().startswith("sitemap:"):
                sitemap_candidates.append(line.split(":", 1)[1].strip())
    if not sitemap_candidates:
        sitemap_candidates.extend([
            urljoin(base_url, "/sitemap.xml"),
            urljoin(base_url, "/sitemap_index.xml"),
        ])

    gathered: List[str] = []
    for sitemap_url in sitemap_candidates:
        result = await fetch_url(client, sitemap_url, limiter, semaphore, timeout)
        if not result.text:
            continue
        locations = extract_sitemap_locations(result.text)
        for loc in locations:
            normalized = normalize_url(loc)
            if not normalized:
                continue
            if not in_scope(normalized, base_host, include_subdomains):
                continue
            if is_skippable(normalized):
                continue
            path = urlparse(normalized).path or "/"
            if not robots.allowed(path):
                continue
            gathered.append(normalized)
            if len(gathered) >= max_pages:
                return gathered[:max_pages]
        if locations and locations[0].endswith(".xml") and len(locations) < max_pages:
            for loc in locations:
                if not loc.endswith(".xml"):
                    continue
                nested = await fetch_url(client, loc, limiter, semaphore, timeout)
                if not nested.text:
                    continue
                nested_urls = extract_sitemap_locations(nested.text)
                for item in nested_urls:
                    normalized = normalize_url(item)
                    if not normalized:
                        continue
                    if not in_scope(normalized, base_host, include_subdomains):
                        continue
                    gathered.append(normalized)
                    if len(gathered) >= max_pages:
                        return gathered[:max_pages]
    return gathered


async def bfs_crawl(
    client: httpx.AsyncClient,
    base_url: str,
    include_subdomains: bool,
    robots: RobotsRules,
    max_depth: int,
    limiter: RateLimiter,
    semaphore: asyncio.Semaphore,
    timeout: float,
    max_pages: int,
    urls: List[str],
    seen: Set[str],
) -> None:
    base_host = urlparse(base_url).netloc.lower()
    queue: asyncio.Queue[Tuple[str, int]] = asyncio.Queue()
    await queue.put((base_url, 0))

    async def worker() -> None:
        while True:
            try:
                current, depth = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            if depth >= max_depth:
                queue.task_done()
                continue
            result = await fetch_url(client, current, limiter, semaphore, timeout)
            if not result.text:
                queue.task_done()
                continue
            soup = BeautifulSoup(result.text, "lxml")
            for link in soup.find_all("a", href=True):
                href = resolve_url(current, link.get("href"))
                if not href:
                    continue
                normalized = normalize_url(href)
                if not normalized:
                    continue
                if normalized in seen:
                    continue
                if not in_scope(normalized, base_host, include_subdomains):
                    continue
                if is_skippable(normalized):
                    continue
                path = urlparse(normalized).path or "/"
                if not robots.allowed(path):
                    continue
                if len(urls) >= max_pages:
                    break
                seen.add(normalized)
                urls.append(normalized)
                await queue.put((normalized, depth + 1))
            queue.task_done()

    workers = [asyncio.create_task(worker()) for _ in range(4)]
    await asyncio.gather(*workers)


def dedupe_video_items(items: List[VideoItem]) -> List[VideoItem]:
    seen: Set[str] = set()
    output: List[VideoItem] = []
    for item in items:
        key = f"{item.provider}:{item.video_url}"
        if key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output


async def process_page(
    url: str,
    client: httpx.AsyncClient,
    limiter: RateLimiter,
    semaphore: asyncio.Semaphore,
    playwright_context: Optional[Any],
    playwright_semaphore: Optional[asyncio.Semaphore],
    use_playwright: str,
    timeout: float,
    keyword_targets: List[str],
    keyword_filter_only: bool,
    cache: Dict[str, Any],
    skip_known_misses: bool,
) -> Optional[PageResult]:
    if should_skip_url(url, cache, keyword_targets, skip_known_misses):
        return None
    fetch = await fetch_url(client, url, limiter, semaphore, timeout)
    if not fetch.text:
        return None
    if keyword_filter_only and keyword_targets:
        quick_matches = quick_keyword_matches(fetch.text, keyword_targets)
        if not quick_matches:
            return None
    meta = extract_meta(BeautifulSoup(fetch.text, "lxml"))
    html = fetch.text
    fetch_mode = "http"

    async def maybe_render() -> Optional[str]:
        if not playwright_context or not playwright_semaphore:
            return None
        async with playwright_semaphore:
            page = await playwright_context.new_page()
            try:
                return await render_with_playwright(page, url, timeout)
            finally:
                await page.close()

    if use_playwright == "always":
        rendered = await maybe_render()
        if rendered:
            html = rendered
            fetch_mode = "playwright"
    elif use_playwright == "auto":
        if page_needs_playwright(fetch.text, meta):
            rendered = await maybe_render()
            if rendered:
                html = rendered
                fetch_mode = "playwright"

    result = build_page_result(
        url, html, fetch_mode, fetch.status_code, fetch.content_type, keyword_targets
    )
    result.video_items = dedupe_video_items(result.video_items)
    return result


async def run_crawl(args: argparse.Namespace) -> int:
    logging.info("Starting crawl for %s", args.base)
    base = args.base.rstrip("/")
    parsed_base = urlparse(base)
    if not parsed_base.scheme:
        base = "https://" + base

    limiter = RateLimiter(args.delay)
    semaphore = asyncio.Semaphore(args.concurrency)

    cache = load_cache(args.cache_file) if args.use_cache else {"urls": {}, "domains": {}}
    base_host = urlparse(base).netloc.lower()

    async with httpx.AsyncClient(headers={"User-Agent": args.user_agent}, follow_redirects=True) as client:
        robots = RobotsRules([])
        robots_url = urljoin(base, "/robots.txt")
        robots_response = await fetch_url(client, robots_url, limiter, semaphore, args.timeout)
        if robots_response.text:
            robots = parse_robots(robots_response.text)

        cached_domain_urls = cache.get("domains", {}).get(base_host, [])
        if args.use_cached_urls and cached_domain_urls:
            urls = cached_domain_urls
        else:
            urls = await discover_urls(
                client,
                base,
                args.max_pages,
                args.include_subdomains,
                robots,
                args.max_depth,
                limiter,
                semaphore,
                args.timeout,
            )
            cache.setdefault("domains", {})[base_host] = urls

        logging.info("Discovered %s URLs", len(urls))

        playwright_browser: Optional[Browser] = None
        playwright_context = None
        playwright_semaphore: Optional[asyncio.Semaphore] = None

        if args.use_playwright != "never":
            playwright = await async_playwright().start()
            playwright_browser = await playwright.chromium.launch(headless=True)
            playwright_context = await playwright_browser.new_context(user_agent=args.user_agent)

            async def handle_route(route, request) -> None:
                if request.resource_type in {"image", "font"}:
                    await route.abort()
                else:
                    await route.continue_()

            await playwright_context.route("**/*", handle_route)
            playwright_semaphore = asyncio.Semaphore(2)

        results: List[PageResult] = []
        fetched = 0
        rendered = 0

        async def handle_url(target: str) -> None:
            nonlocal fetched, rendered
            res = await process_page(
                target,
                client,
                limiter,
                semaphore,
                playwright_context,
                playwright_semaphore,
                args.use_playwright,
                args.timeout,
                args.keywords,
                args.keyword_filter_only,
                cache,
                args.skip_known_misses,
            )
            if res:
                fetched += 1
                if res.fetch_mode == "playwright":
                    rendered += 1
                if res.chosen_thumbnail_url is None and res.video_items:
                    for item in res.video_items:
                        if item.provider in {"youtube", "vimeo"}:
                            thumb = await fetch_oembed(client, item.video_url, item.provider)
                            if thumb:
                                res.chosen_thumbnail_url = thumb
                                res.badges.append("oembed")
                                break
                results.append(res)

        tasks: List[asyncio.Task[None]] = []
        for target_url in urls:
            tasks.append(asyncio.create_task(handle_url(target_url)))
            if len(tasks) >= args.concurrency:
                await asyncio.gather(*tasks)
                tasks = []
        if tasks:
            await asyncio.gather(*tasks)

        if args.use_cache:
            for result in results:
                cache.setdefault("urls", {})[result.page_url] = {
                    "keywords": sorted(args.keywords),
                    "matched": bool(result.matched_keywords),
                    "timestamp": time.time(),
                }
            save_cache(args.cache_file, cache)

        if playwright_browser:
            await playwright_browser.close()
            await playwright.stop()

    with_videos = [
        result
        for result in results
        if result.video_items or (args.include_keyword_matches and result.matched_keywords)
    ]
    keyword_matches = [result for result in results if result.matched_keywords]
    stats = {
        "discovered": len(urls),
        "fetched": fetched,
        "playwright": rendered,
        "with_videos": len([r for r in results if r.video_items]),
        "keyword_matches": len(keyword_matches),
    }

    json_path = args.out.rsplit(".", 1)[0] + ".json"
    json_data = [
        {
            "page_url": result.page_url,
            "canonical_url": result.canonical_url,
            "page_title": result.page_title,
            "description": result.description,
            "keywords": result.keywords,
            "tags": result.tags,
            "matched_keywords": result.matched_keywords,
            "video_items": [item.__dict__ for item in result.video_items],
            "chosen_thumbnail_url": result.chosen_thumbnail_url,
            "chosen_video_url": result.chosen_video_url,
            "fetch_mode": result.fetch_mode,
            "http_status": result.http_status,
            "content_type": result.content_type,
        }
        for result in results
    ]
    with open(json_path, "w", encoding="utf-8") as handle:
        json.dump({"stats": stats, "results": json_data}, handle, indent=2)

    render_html_report(with_videos, stats, args.out)

    logging.info("Report written to %s and %s", args.out, json_path)
    return 0


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Crawl a site and generate a video grid report.")
    parser.add_argument("--base", help="Base URL to crawl, e.g., https://example.com")
    parser.add_argument("--max-pages", type=int, default=250, help="Maximum pages to crawl")
    parser.add_argument("--concurrency", type=int, default=6, help="Concurrent requests")
    parser.add_argument("--delay", type=float, default=0.15, help="Delay between request starts (seconds)")
    parser.add_argument("--out", default="report.html", help="Output HTML file")
    parser.add_argument("--include-subdomains", action="store_true", help="Include subdomains")
    parser.add_argument(
        "--use-playwright",
        choices=["always", "auto", "never"],
        default="auto",
        help="Playwright usage strategy",
    )
    parser.add_argument("--max-depth", type=int, default=3, help="Max depth for link crawl")
    parser.add_argument("--timeout", type=int, default=20, help="Request timeout in seconds")
    parser.add_argument("--user-agent", default=USER_AGENT_DEFAULT, help="User-Agent header")
    parser.add_argument(
        "--keywords",
        default="",
        help="Comma-separated keywords to match in page text/tags (e.g., \"pricing,private beta\")",
    )
    parser.add_argument(
        "--keyword-filter-only",
        action="store_true",
        help="Skip pages without keyword matches to speed up crawls",
    )
    parser.add_argument(
        "--include-keyword-matches",
        action="store_true",
        help="Include pages that match keywords even if no videos are detected",
    )
    parser.add_argument(
        "--cache-file",
        default="crawl_cache.json",
        help="Cache file for remembering URL keyword matches",
    )
    parser.add_argument(
        "--use-cache",
        action="store_true",
        help="Use cache to skip known misses and reuse URL lists",
    )
    parser.add_argument(
        "--use-cached-urls",
        action="store_true",
        help="Use cached URL list for the domain instead of rediscovering",
    )
    parser.add_argument(
        "--skip-known-misses",
        action="store_true",
        help="Skip URLs that previously had no keyword matches",
    )
    parser.add_argument(
        "--gui",
        action="store_true",
        help="Launch a simple interactive GUI for entering crawl options",
    )
    args = parser.parse_args(argv)
    args.keywords = [item.strip() for item in args.keywords.split(",") if item.strip()]
    if args.keywords and not args.include_keyword_matches:
        args.include_keyword_matches = True
    if args.keywords and not args.skip_known_misses:
        args.skip_known_misses = True
    if args.use_cached_urls and not args.use_cache:
        args.use_cache = True
    return args


def build_gui() -> None:
    import tkinter as tk
    from tkinter import ttk, messagebox, scrolledtext

    args = parse_args([])

    root = tk.Tk()
    root.title("Universal Site Video Grid")
    root.geometry("700x720")

    frame = ttk.Frame(root, padding=16)
    frame.pack(fill=tk.BOTH, expand=True)

    def add_row(label: str, var: tk.Variable) -> None:
        row = ttk.Frame(frame)
        row.pack(fill=tk.X, pady=4)
        ttk.Label(row, text=label, width=18).pack(side=tk.LEFT)
        ttk.Entry(row, textvariable=var).pack(side=tk.LEFT, fill=tk.X, expand=True)

    base_var = tk.StringVar()
    out_var = tk.StringVar(value="report.html")
    max_pages_var = tk.IntVar(value=250)
    concurrency_var = tk.IntVar(value=6)
    delay_var = tk.DoubleVar(value=0.15)
    max_depth_var = tk.IntVar(value=3)
    timeout_var = tk.IntVar(value=20)
    user_agent_var = tk.StringVar(value=USER_AGENT_DEFAULT)
    include_subdomains_var = tk.BooleanVar(value=False)
    playwright_var = tk.StringVar(value="auto")
    keywords_var = tk.StringVar()
    include_keyword_var = tk.BooleanVar(value=True)
    keyword_filter_only_var = tk.BooleanVar(value=False)
    use_cache_var = tk.BooleanVar(value=True)
    use_cached_urls_var = tk.BooleanVar(value=False)
    skip_known_misses_var = tk.BooleanVar(value=True)
    cache_file_var = tk.StringVar(value="crawl_cache.json")

    ttk.Label(frame, text="Site Search & Crawl Options", font=("Arial", 14, "bold")).pack(
        anchor=tk.W, pady=(0, 8)
    )
    add_row("Base URL", base_var)
    add_row("Output HTML", out_var)
    add_row("Max pages", max_pages_var)
    add_row("Concurrency", concurrency_var)
    add_row("Delay (s)", delay_var)
    add_row("Max depth", max_depth_var)
    add_row("Timeout (s)", timeout_var)
    add_row("User-Agent", user_agent_var)
    add_row("Keywords", keywords_var)
    add_row("Cache file", cache_file_var)

    subdomain_row = ttk.Frame(frame)
    subdomain_row.pack(fill=tk.X, pady=4)
    ttk.Checkbutton(
        subdomain_row, text="Include subdomains", variable=include_subdomains_var
    ).pack(side=tk.LEFT)

    keyword_row = ttk.Frame(frame)
    keyword_row.pack(fill=tk.X, pady=4)
    ttk.Checkbutton(
        keyword_row,
        text="Include keyword matches without videos",
        variable=include_keyword_var,
    ).pack(side=tk.LEFT)

    filter_row = ttk.Frame(frame)
    filter_row.pack(fill=tk.X, pady=4)
    ttk.Checkbutton(
        filter_row,
        text="Only keep pages with keyword matches (faster)",
        variable=keyword_filter_only_var,
    ).pack(side=tk.LEFT)

    cache_row = ttk.Frame(frame)
    cache_row.pack(fill=tk.X, pady=4)
    ttk.Checkbutton(cache_row, text="Enable cache", variable=use_cache_var).pack(side=tk.LEFT)

    cached_urls_row = ttk.Frame(frame)
    cached_urls_row.pack(fill=tk.X, pady=4)
    ttk.Checkbutton(
        cached_urls_row,
        text="Use cached URLs for this domain (look again)",
        variable=use_cached_urls_var,
    ).pack(side=tk.LEFT)

    skip_row = ttk.Frame(frame)
    skip_row.pack(fill=tk.X, pady=4)
    ttk.Checkbutton(
        skip_row,
        text="Skip known keyword misses",
        variable=skip_known_misses_var,
    ).pack(side=tk.LEFT)

    mode_row = ttk.Frame(frame)
    mode_row.pack(fill=tk.X, pady=4)
    ttk.Label(mode_row, text="Playwright", width=18).pack(side=tk.LEFT)
    ttk.Combobox(
        mode_row,
        textvariable=playwright_var,
        values=["auto", "always", "never"],
        state="readonly",
        width=12,
    ).pack(side=tk.LEFT)

    log_box = scrolledtext.ScrolledText(frame, height=16, state="disabled")
    log_box.pack(fill=tk.BOTH, expand=True, pady=(12, 8))

    def log_line(message: str) -> None:
        log_box.configure(state="normal")
        log_box.insert(tk.END, message + "\n")
        log_box.configure(state="disabled")
        log_box.see(tk.END)

    def run_crawl_from_gui(use_cached: bool = False) -> None:
        if not base_var.get().strip():
            messagebox.showerror("Missing base URL", "Please enter a base URL to crawl.")
            return

        args.base = base_var.get().strip()
        args.out = out_var.get().strip() or "report.html"
        args.max_pages = max_pages_var.get()
        args.concurrency = concurrency_var.get()
        args.delay = delay_var.get()
        args.max_depth = max_depth_var.get()
        args.timeout = timeout_var.get()
        args.user_agent = user_agent_var.get().strip() or USER_AGENT_DEFAULT
        args.include_subdomains = include_subdomains_var.get()
        args.use_playwright = playwright_var.get()
        args.keywords = [item.strip() for item in keywords_var.get().split(",") if item.strip()]
        args.include_keyword_matches = include_keyword_var.get() or bool(args.keywords)
        args.keyword_filter_only = keyword_filter_only_var.get()
        args.use_cache = use_cache_var.get()
        args.use_cached_urls = use_cached_urls_var.get() or use_cached
        args.skip_known_misses = skip_known_misses_var.get() or use_cached
        args.cache_file = cache_file_var.get().strip() or "crawl_cache.json"

        log_line(f"Starting crawl for {args.base}")

        def runner() -> None:
            try:
                asyncio.run(run_crawl(args))
                log_line("Crawl completed.")
                log_line(f"HTML report: {args.out}")
                log_line(f"JSON report: {args.out.rsplit('.', 1)[0] + '.json'}")
            except Exception as exc:
                log_line(f"Error: {exc}")
        threading.Thread(target=runner, daemon=True).start()

    button_row = ttk.Frame(frame)
    button_row.pack(pady=6)
    ttk.Button(button_row, text="Start crawl", command=run_crawl_from_gui).pack(side=tk.LEFT, padx=4)
    ttk.Button(
        button_row,
        text="Look again",
        command=lambda: run_crawl_from_gui(use_cached=True),
    ).pack(side=tk.LEFT, padx=4)

    def on_close() -> None:
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_close)
    root.mainloop()


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    try:
        if args.gui:
            build_gui()
            return 0
        if not args.base:
            raise SystemExit("Error: --base is required unless --gui is used.")
        return asyncio.run(run_crawl(args))
    except KeyboardInterrupt:
        logging.info("Interrupted.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
