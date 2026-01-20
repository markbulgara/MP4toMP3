import csv
import json
import os
import subprocess
import time
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import urlparse

from PySide6.QtCore import QObject, Signal

from .config import CrawlConfig
from .utils import (
    VIDEO_EXTENSIONS,
    asset_type_from_url,
    dedupe_urls,
    ensure_dir,
    merge_page_metadata,
    normalize_url,
    write_jsonl,
    write_lines,
)


class CrawlSignals(QObject):
    log = Signal(str)
    error = Signal(str)
    progress = Signal(dict)
    completed = Signal(Path)
    failed = Signal(str)


class KatanaRunner(QObject):
    def __init__(self, target: str, output_root: Path, config: CrawlConfig) -> None:
        super().__init__()
        self.target = target
        self.output_root = output_root
        self.config = config
        self.signals = CrawlSignals()
        self._stop_requested = False
        self._current_process: Optional[subprocess.Popen] = None
        self._start_time: Optional[float] = None

    def stop(self) -> None:
        self._stop_requested = True
        if self._current_process and self._current_process.poll() is None:
            self._terminate_process(self._current_process)

    def run(self) -> None:
        start_time = datetime.utcnow()
        self._start_time = time.time()
        run_dir = self._create_run_dir(start_time)
        errors_path = run_dir / "errors.log"
        log_handle = errors_path.open("w", encoding="utf-8")
        url_set: Set[str] = set()
        assets: Set[str] = set()
        xhr_items: List[Dict] = []
        xhr_seen: Set[Tuple[str, str]] = set()
        pages: Dict[str, Dict] = {}
        discovered: Dict[str, Set[str]] = {}
        pass_totals = {"urls": 0, "pages": 0, "assets": 0, "xhr": 0}

        try:
            self.signals.log.emit("Starting crawl...")
            help_text = self._katana_help()
            version_text = self._katana_version()

            pass_totals["urls"] += self._run_pass(
                "Pass A: URL discovery",
                self._build_url_discovery_args(help_text),
                log_handle,
                lambda line: self._handle_url(line, url_set, discovered, "A"),
                "urls",
            )

            pass_totals["pages"] += self._run_pass(
                "Pass B: metadata extraction",
                self._build_metadata_args(help_text),
                log_handle,
                lambda line: self._handle_metadata(line, pages, discovered, "B"),
                "pages",
            )

            pass_totals["assets"] += self._run_pass(
                "Pass C: asset discovery",
                self._build_asset_args(help_text),
                log_handle,
                lambda line: self._handle_asset(line, assets, discovered, "C"),
                "assets",
            )

            if self.config.enable_xhr:
                pass_totals["xhr"] += self._run_pass(
                    "Pass D: XHR discovery",
                    self._build_xhr_args(help_text),
                    log_handle,
                    lambda line: self._handle_xhr(
                        line, xhr_items, xhr_seen, discovered, "D"
                    ),
                    "xhr",
                )
            else:
                self.signals.log.emit("Pass D skipped (XHR disabled).")

            if self._stop_requested:
                raise RuntimeError("Crawl cancelled by user.")

            urls = sorted(url_set)
            assets_list = sorted(assets)
            self._write_outputs(
                run_dir,
                start_time,
                urls,
                pages,
                assets_list,
                xhr_items,
                pass_totals,
                version_text,
            )
            self.signals.completed.emit(run_dir)
        except Exception as exc:
            message = str(exc)
            self.signals.error.emit(message)
            self.signals.failed.emit(message)
        finally:
            log_handle.close()

    def _create_run_dir(self, start_time: datetime) -> Path:
        slug = start_time.strftime("%Y%m%d-%H%M%S")
        run_dir = self.output_root / f"run-{slug}"
        ensure_dir(run_dir)
        return run_dir

    def _write_outputs(
        self,
        run_dir: Path,
        start_time: datetime,
        urls: List[str],
        pages: Dict[str, Dict],
        assets: List[str],
        xhr_items: List[Dict],
        pass_totals: Dict[str, int],
        version_text: str,
    ) -> None:
        write_lines(run_dir / "urls.txt", urls)
        write_lines(run_dir / "assets.txt", assets)
        write_jsonl(run_dir / "pages.jsonl", pages.values())
        write_jsonl(run_dir / "xhr.jsonl", xhr_items)
        summary_path = run_dir / "summary.csv"
        with summary_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(
                [
                    "url",
                    "title",
                    "description",
                    "og_video",
                    "og_image",
                    "content_type",
                    "discovered_from_pass",
                ]
            )
            for url, page in pages.items():
                passes = ",".join(sorted(page.get("discovered_from_pass", [])))
                writer.writerow(
                    [
                        url,
                        page.get("title", ""),
                        page.get("description", ""),
                        page.get("og_video", ""),
                        page.get("og_image", ""),
                        page.get("content_type", ""),
                        passes,
                    ]
                )
        run_metadata = {
            "start_time": start_time.isoformat() + "Z",
            "target": self.target,
            "settings": asdict(self.config),
            "totals": {
                "urls": len(urls),
                "pages": len(pages),
                "assets": len(assets),
                "xhr": len(xhr_items),
            },
            "katana_version": version_text,
        }
        (run_dir / "run.json").write_text(
            json.dumps(run_metadata, indent=2), encoding="utf-8"
        )

    def _run_pass(
        self,
        title: str,
        args: List[str],
        log_handle,
        handler,
        kind: str,
    ) -> int:
        if self._stop_requested:
            return 0
        self.signals.log.emit(title)
        self.signals.log.emit(" ".join(args))
        count = 0
        for line in self._stream_process(args, log_handle):
            if self._stop_requested:
                break
            if not line:
                continue
            handled = handler(line)
            if handled:
                count += 1
                self.signals.progress.emit({"kind": kind})
        return count

    def _stream_process(self, args: List[str], log_handle) -> Iterable[str]:
        process = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            preexec_fn=os.setsid if os.name != "nt" else None,
        )
        self._current_process = process
        if not process.stdout or not process.stderr:
            return []
        try:
            while True:
                if self._start_time and self.config.max_runtime > 0:
                    elapsed = time.time() - self._start_time
                    if elapsed >= self.config.max_runtime:
                        self.signals.log.emit(
                            f"Max runtime reached ({self.config.max_runtime}s)."
                        )
                        self._stop_requested = True
                        self._terminate_process(process)
                        break
                if self._stop_requested:
                    self._terminate_process(process)
                    break
                line = process.stdout.readline()
                err_line = process.stderr.readline()
                if err_line:
                    log_handle.write(err_line)
                    log_handle.flush()
                    self.signals.log.emit(err_line.strip())
                if not line:
                    if process.poll() is not None:
                        break
                    time.sleep(0.05)
                    continue
                yield line.strip()
        finally:
            if process.poll() is None:
                self._terminate_process(process)

    def _terminate_process(self, process: subprocess.Popen) -> None:
        try:
            if os.name == "nt":
                subprocess.call(
                    ["taskkill", "/F", "/T", "/PID", str(process.pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                os.killpg(os.getpgid(process.pid), 15)
        except Exception:
            process.terminate()
        finally:
            try:
                process.wait(timeout=2)
            except Exception:
                process.kill()

    def _handle_url(
        self, line: str, url_set: Set[str], discovered: Dict[str, Set[str]], tag: str
    ) -> bool:
        if len(url_set) >= self.config.max_urls:
            self.signals.log.emit(
                f"Max URL limit reached ({self.config.max_urls}). Stopping discovery."
            )
            self._stop_requested = True
            return False
        normalized = normalize_url(line, aggressive=self.config.aggressive_dedupe)
        if not normalized:
            return False
        if self.config.same_host_only and not self._is_same_host(normalized):
            return False
        if normalized in url_set:
            return False
        url_set.add(normalized)
        discovered.setdefault(normalized, set()).add(tag)
        return True

    def _handle_metadata(
        self, line: str, pages: Dict[str, Dict], discovered: Dict[str, Set[str]], tag: str
    ) -> bool:
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            return False
        url = payload.get("url") or payload.get("input")
        normalized = normalize_url(url, aggressive=self.config.aggressive_dedupe)
        if not normalized:
            return False
        if self.config.same_host_only and not self._is_same_host(normalized):
            return False
        metadata = {
            "url": normalized,
            "title": payload.get("title"),
            "description": payload.get("description"),
            "og_title": payload.get("og:title"),
            "og_description": payload.get("og:description"),
            "og_video": payload.get("og:video"),
            "og_image": payload.get("og:image"),
            "twitter_title": payload.get("twitter:title"),
            "twitter_description": payload.get("twitter:description"),
            "content_type": payload.get("content_type"),
            "discovered_from_pass": sorted(
                discovered.get(normalized, set()).union({tag})
            ),
        }
        existing = pages.get(normalized, {})
        pages[normalized] = merge_page_metadata(existing, metadata)
        return True

    def _handle_asset(
        self, line: str, assets: Set[str], discovered: Dict[str, Set[str]], tag: str
    ) -> bool:
        normalized = normalize_url(line, aggressive=self.config.aggressive_dedupe)
        if not normalized:
            return False
        if self.config.same_host_only and not self._is_same_host(normalized):
            return False
        extension = asset_type_from_url(normalized)
        if extension not in VIDEO_EXTENSIONS:
            return False
        if normalized in assets:
            return False
        assets.add(normalized)
        discovered.setdefault(normalized, set()).add(tag)
        return True

    def _handle_xhr(
        self,
        line: str,
        xhr_items: List[Dict],
        xhr_seen: Set[Tuple[str, str]],
        discovered: Dict[str, Set[str]],
        tag: str,
    ) -> bool:
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            return False
        url = payload.get("url") or payload.get("endpoint")
        normalized = normalize_url(url, aggressive=self.config.aggressive_dedupe)
        if not normalized:
            return False
        if self.config.same_host_only and not self._is_same_host(normalized):
            return False
        method = payload.get("method", "GET")
        key = (normalized, method)
        if key in xhr_seen:
            return False
        xhr_seen.add(key)
        item = {
            "url": normalized,
            "method": method,
            "content_type": payload.get("content_type") or payload.get("type"),
            "discovered_from_pass": tag,
        }
        xhr_items.append(item)
        discovered.setdefault(normalized, set()).add(tag)
        return True

    def _build_url_discovery_args(self, help_text: str) -> List[str]:
        args = [self._katana_binary(), "-u", self.target]
        args.extend(self._base_args(help_text))
        args.append("-silent")
        return args

    def _build_metadata_args(self, help_text: str) -> List[str]:
        fields = [
            "title",
            "description",
            "og:title",
            "og:description",
            "og:video",
            "og:image",
            "twitter:title",
            "twitter:description",
        ]
        args = [self._katana_binary(), "-u", self.target]
        args.extend(self._base_args(help_text))
        args.extend(["-json", "-field", ",".join(fields)])
        return args

    def _build_asset_args(self, help_text: str) -> List[str]:
        extensions = [ext.strip() for ext in self.config.extensions.split(",") if ext.strip()]
        args = [self._katana_binary(), "-u", self.target]
        args.extend(self._base_args(help_text))
        args.extend(["-extension", ",".join(extensions), "-silent"])
        return args

    def _build_xhr_args(self, help_text: str) -> List[str]:
        args = [self._katana_binary(), "-u", self.target]
        args.extend(self._base_args(help_text))
        if "-xhr" in help_text:
            args.append("-xhr")
        args.append("-json")
        return args

    def _base_args(self, help_text: str) -> List[str]:
        args: List[str] = []
        depth_flag = self._pick_flag(help_text, ["-d", "-depth"])
        if depth_flag:
            args.extend([depth_flag, str(self.config.depth)])
        if self.config.enable_js_crawl and "-js-crawl" in help_text:
            args.append("-js-crawl")
        if self.config.enable_jsluice and "-jsl" in help_text:
            args.append("-jsl")
        if self.config.respect_robots and "-respect-robots" in help_text:
            args.append("-respect-robots")
        if not self.config.respect_robots and "-no-robots" in help_text:
            args.append("-no-robots")
        concurrency_flag = self._pick_flag(help_text, ["-concurrency", "-c"])
        if concurrency_flag:
            args.extend([concurrency_flag, str(self.config.concurrency)])
        delay_flag = self._pick_flag(help_text, ["-delay", "-rl"])
        if delay_flag:
            delay_value = self.config.delay
            if delay_flag == "-delay":
                delay_value = int(round(self.config.delay * 1000))
            args.extend([delay_flag, str(delay_value)])
        timeout_flag = self._pick_flag(help_text, ["-timeout", "-t"])
        if timeout_flag:
            args.extend([timeout_flag, str(self.config.timeout)])
        max_urls_flag = self._pick_flag(help_text, ["-max-urls", "-max-requests"])
        if max_urls_flag:
            args.extend([max_urls_flag, str(self.config.max_urls)])
        if self.config.same_host_only and "-same-host" in help_text:
            args.append("-same-host")
        if self.config.include_patterns:
            include_flag = self._pick_flag(help_text, ["-include", "-include-pattern"])
            if include_flag:
                args.extend([include_flag, self.config.include_patterns])
        if self.config.custom_args:
            args.extend(self.config.custom_args.split())
        return args

    def _pick_flag(self, help_text: str, candidates: Iterable[str]) -> Optional[str]:
        for candidate in candidates:
            if candidate in help_text:
                return candidate
        return None

    def _katana_binary(self) -> str:
        return self.config.katana_path or "katana"

    def _katana_help(self) -> str:
        try:
            result = subprocess.run(
                [self._katana_binary(), "-h"],
                capture_output=True,
                text=True,
                check=False,
            )
            return result.stdout + result.stderr
        except Exception:
            return ""

    def _katana_version(self) -> str:
        try:
            result = subprocess.run(
                [self._katana_binary(), "-version"],
                capture_output=True,
                text=True,
                check=False,
            )
            return result.stdout.strip() or result.stderr.strip()
        except Exception:
            return "unknown"

    def _is_same_host(self, url: str) -> bool:
        return urlparse(self.target).netloc.lower() == urlparse(url).netloc.lower()
