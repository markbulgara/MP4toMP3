import json
from dataclasses import dataclass, asdict, field
from pathlib import Path

from PySide6.QtCore import QStandardPaths


@dataclass
class CrawlConfig:
    depth: int = 5
    max_urls: int = 50000
    max_runtime: int = 1800
    timeout: int = 15
    concurrency: int = 5
    delay: float = 0.2
    respect_robots: bool = True
    same_host_only: bool = True
    include_patterns: str = ""
    extensions: str = "mp4,webm,m3u8"
    enable_js_crawl: bool = True
    enable_jsluice: bool = True
    enable_xhr: bool = True
    aggressive_dedupe: bool = False
    custom_args: str = ""
    katana_path: str = ""


@dataclass
class AppConfig:
    last_target: str = ""
    output_root: str = ""
    crawl: CrawlConfig = field(default_factory=CrawlConfig)


CONFIG_FILENAME = "config.json"


def config_dir() -> Path:
    base = Path(QStandardPaths.writableLocation(QStandardPaths.AppConfigLocation))
    return base / "KatanaVideoCrawler"


def load_config() -> AppConfig:
    path = config_dir() / CONFIG_FILENAME
    if not path.exists():
        return AppConfig()
    raw = json.loads(path.read_text(encoding="utf-8"))
    crawl_raw = raw.get("crawl", {})
    crawl = CrawlConfig(**{**CrawlConfig().__dict__, **crawl_raw})
    return AppConfig(
        last_target=raw.get("last_target", ""),
        output_root=raw.get("output_root", ""),
        crawl=crawl,
    )


def save_config(config: AppConfig) -> None:
    path = config_dir() / CONFIG_FILENAME
    path.parent.mkdir(parents=True, exist_ok=True)
    data = asdict(config)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
