import json
import shutil
import sys
import time
import platform
from pathlib import Path
from typing import Dict, List, Optional

from PySide6.QtCore import QStandardPaths, QThread, QTimer, QUrl
from PySide6.QtGui import QAction, QDesktopServices
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QDoubleSpinBox,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from .config import CrawlConfig, load_config, save_config
from .katana_runner import KatanaRunner
from .utils import asset_type_from_url, normalize_url


class CrawlThread(QThread):
    def __init__(self, runner: KatanaRunner) -> None:
        super().__init__()
        self.runner = runner

    def run(self) -> None:
        self.runner.run()


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Katana Video Site Crawler")
        self.resize(1200, 800)

        self.config = load_config()
        self.output_root = self._resolve_output_root()
        self.runner: Optional[KatanaRunner] = None
        self.thread: Optional[CrawlThread] = None
        self.last_run_dir: Optional[Path] = None
        self.counts = {"urls": 0, "pages": 0, "assets": 0, "xhr": 0}
        self.log_lines: List[str] = []
        self.pages_data: List[Dict] = []
        self.assets_data: List[Dict] = []
        self.xhr_data: List[Dict] = []

        self._build_ui()
        self._load_config_into_ui()

        self.timer = QTimer(self)
        self.timer.setInterval(1000)
        self.timer.timeout.connect(self._update_elapsed)
        self.start_time: Optional[float] = None

    def _build_ui(self) -> None:
        central = QWidget()
        layout = QVBoxLayout(central)

        target_layout = QHBoxLayout()
        self.target_input = QLineEdit()
        self.target_input.setPlaceholderText("https://example.com")
        self.run_button = QPushButton("Run Crawl")
        self.stop_button = QPushButton("Stop")
        self.stop_button.setEnabled(False)
        target_layout.addWidget(QLabel("Target URL:"))
        target_layout.addWidget(self.target_input, 1)
        target_layout.addWidget(self.run_button)
        target_layout.addWidget(self.stop_button)
        layout.addLayout(target_layout)

        disclaimer = QLabel(
            "Use only on systems you own or have explicit permission to test."
        )
        disclaimer.setStyleSheet("color: #b00020;")
        layout.addWidget(disclaimer)

        self.advanced_group = QGroupBox("Advanced")
        self.advanced_group.setCheckable(True)
        self.advanced_group.setChecked(False)
        advanced_layout = QFormLayout(self.advanced_group)

        self.depth_input = QSpinBox()
        self.depth_input.setRange(1, 50)
        self.max_urls_input = QSpinBox()
        self.max_urls_input.setRange(100, 1000000)
        self.max_runtime_input = QSpinBox()
        self.max_runtime_input.setRange(60, 86400)
        self.timeout_input = QSpinBox()
        self.timeout_input.setRange(5, 120)
        self.concurrency_input = QSpinBox()
        self.concurrency_input.setRange(1, 50)
        self.delay_input = QDoubleSpinBox()
        self.delay_input.setRange(0.0, 10.0)
        self.delay_input.setSingleStep(0.1)
        self.respect_robots_input = QCheckBox("Respect robots.txt")
        self.same_host_input = QCheckBox("Same host only")
        self.include_patterns_input = QLineEdit()
        self.extensions_input = QLineEdit()
        self.js_crawl_input = QCheckBox("Enable JS crawl")
        self.jsluice_input = QCheckBox("Enable jsluice")
        self.xhr_input = QCheckBox("Enable XHR capture")
        self.aggressive_dedupe_input = QCheckBox("Aggressive dedupe")
        self.custom_args_input = QLineEdit()
        self.katana_path_input = QLineEdit()
        self.katana_browse_button = QPushButton("Browse...")
        self.katana_status = QLabel("")
        self.output_root_input = QLineEdit()
        self.output_root_button = QPushButton("Browse...")

        katana_layout = QHBoxLayout()
        katana_layout.addWidget(self.katana_path_input, 1)
        katana_layout.addWidget(self.katana_browse_button)

        output_layout = QHBoxLayout()
        output_layout.addWidget(self.output_root_input, 1)
        output_layout.addWidget(self.output_root_button)

        advanced_layout.addRow("Depth", self.depth_input)
        advanced_layout.addRow("Max URLs", self.max_urls_input)
        advanced_layout.addRow("Max runtime (s)", self.max_runtime_input)
        advanced_layout.addRow("Timeout per request (s)", self.timeout_input)
        advanced_layout.addRow("Concurrency", self.concurrency_input)
        advanced_layout.addRow("Delay (s)", self.delay_input)
        advanced_layout.addRow(self.respect_robots_input)
        advanced_layout.addRow(self.same_host_input)
        advanced_layout.addRow("Include patterns", self.include_patterns_input)
        advanced_layout.addRow("Asset extensions", self.extensions_input)
        advanced_layout.addRow(self.js_crawl_input)
        advanced_layout.addRow(self.jsluice_input)
        advanced_layout.addRow(self.xhr_input)
        advanced_layout.addRow(self.aggressive_dedupe_input)
        advanced_layout.addRow("Custom katana args", self.custom_args_input)
        advanced_layout.addRow("Katana binary", katana_layout)
        advanced_layout.addRow("Katana status", self.katana_status)
        advanced_layout.addRow("Output root", output_layout)

        layout.addWidget(self.advanced_group)

        progress_layout = QHBoxLayout()
        self.urls_label = QLabel("URLs: 0")
        self.pages_label = QLabel("Pages: 0")
        self.assets_label = QLabel("Assets: 0")
        self.xhr_label = QLabel("XHR: 0")
        self.elapsed_label = QLabel("Elapsed: 00:00:00")
        progress_layout.addWidget(self.urls_label)
        progress_layout.addWidget(self.pages_label)
        progress_layout.addWidget(self.assets_label)
        progress_layout.addWidget(self.xhr_label)
        progress_layout.addWidget(self.elapsed_label)
        progress_layout.addStretch(1)
        layout.addLayout(progress_layout)

        self.log_view = QTextEdit()
        self.log_view.setReadOnly(True)
        self.log_view.setMaximumHeight(160)
        layout.addWidget(self.log_view)

        results_header = QHBoxLayout()
        self.filter_input = QLineEdit()
        self.filter_input.setPlaceholderText("Filter current tab")
        self.export_csv_button = QPushButton("Export CSV")
        self.export_json_button = QPushButton("Export JSON")
        self.open_results_button = QPushButton("Open Results Folder")
        self.open_results_button.setEnabled(False)
        results_header.addWidget(self.filter_input, 1)
        results_header.addWidget(self.export_csv_button)
        results_header.addWidget(self.export_json_button)
        results_header.addWidget(self.open_results_button)
        layout.addLayout(results_header)

        self.tabs = QTabWidget()
        self.pages_table = QTableWidget(0, 6)
        self.pages_table.setHorizontalHeaderLabels(
            ["URL", "Title", "Description", "OG Video", "OG Image", "Content Type"]
        )
        self.assets_table = QTableWidget(0, 2)
        self.assets_table.setHorizontalHeaderLabels(["URL", "Type"])
        self.xhr_table = QTableWidget(0, 2)
        self.xhr_table.setHorizontalHeaderLabels(["URL", "Method"])
        self.errors_view = QTextEdit()
        self.errors_view.setReadOnly(True)

        self.tabs.addTab(self.pages_table, "Pages")
        self.tabs.addTab(self.assets_table, "Assets")
        self.tabs.addTab(self.xhr_table, "XHR")
        self.tabs.addTab(self.errors_view, "Logs")
        layout.addWidget(self.tabs)

        self.setCentralWidget(central)

        self.run_button.clicked.connect(self.start_crawl)
        self.stop_button.clicked.connect(self.stop_crawl)
        self.katana_browse_button.clicked.connect(self.browse_katana)
        self.katana_path_input.textChanged.connect(lambda: self._update_katana_status())
        self.output_root_button.clicked.connect(self.browse_output_root)
        self.export_csv_button.clicked.connect(self.export_csv)
        self.export_json_button.clicked.connect(self.export_json)
        self.open_results_button.clicked.connect(self.open_results)
        self.filter_input.textChanged.connect(self.apply_filter)

    def _load_config_into_ui(self) -> None:
        self.target_input.setText(self.config.last_target)
        crawl = self.config.crawl
        self.depth_input.setValue(crawl.depth)
        self.max_urls_input.setValue(crawl.max_urls)
        self.max_runtime_input.setValue(crawl.max_runtime)
        self.timeout_input.setValue(crawl.timeout)
        self.concurrency_input.setValue(crawl.concurrency)
        self.delay_input.setValue(crawl.delay)
        self.respect_robots_input.setChecked(crawl.respect_robots)
        self.same_host_input.setChecked(crawl.same_host_only)
        self.include_patterns_input.setText(crawl.include_patterns)
        self.extensions_input.setText(crawl.extensions)
        self.js_crawl_input.setChecked(crawl.enable_js_crawl)
        self.jsluice_input.setChecked(crawl.enable_jsluice)
        self.xhr_input.setChecked(crawl.enable_xhr)
        self.aggressive_dedupe_input.setChecked(crawl.aggressive_dedupe)
        self.custom_args_input.setText(crawl.custom_args)
        self.katana_path_input.setText(crawl.katana_path)
        self.output_root_input.setText(str(self.output_root))
        self._update_katana_status()

    def _resolve_output_root(self) -> Path:
        if self.config.output_root:
            return Path(self.config.output_root)
        documents = Path(QStandardPaths.writableLocation(QStandardPaths.DocumentsLocation))
        return documents / "KatanaVideoCrawler" / "runs"

    def _update_katana_status(self) -> None:
        path = self.katana_path_input.text().strip()
        available = self._katana_available(path)
        message = "Found" if available else "Not found"
        self.katana_status.setText(message)

    def _katana_available(self, path: str) -> bool:
        if path:
            return Path(path).exists()
        return shutil.which("katana") is not None

    def _collect_config(self) -> CrawlConfig:
        return CrawlConfig(
            depth=self.depth_input.value(),
            max_urls=self.max_urls_input.value(),
            max_runtime=self.max_runtime_input.value(),
            timeout=self.timeout_input.value(),
            concurrency=self.concurrency_input.value(),
            delay=self.delay_input.value(),
            respect_robots=self.respect_robots_input.isChecked(),
            same_host_only=self.same_host_input.isChecked(),
            include_patterns=self.include_patterns_input.text().strip(),
            extensions=self.extensions_input.text().strip() or "mp4,webm,m3u8",
            enable_js_crawl=self.js_crawl_input.isChecked(),
            enable_jsluice=self.jsluice_input.isChecked(),
            enable_xhr=self.xhr_input.isChecked(),
            aggressive_dedupe=self.aggressive_dedupe_input.isChecked(),
            custom_args=self.custom_args_input.text().strip(),
            katana_path=self.katana_path_input.text().strip(),
        )

    def start_crawl(self) -> None:
        target = normalize_url(self.target_input.text())
        if not target:
            QMessageBox.warning(self, "Invalid URL", "Please enter a valid URL.")
            return
        if not self._katana_available(self.katana_path_input.text().strip()):
            QMessageBox.warning(
                self,
                "Katana not found",
                "Katana was not found. Install it from https://github.com/projectdiscovery/katana "
                "or browse to the binary in Advanced settings.",
            )
            return
        self._reset_state()
        self.run_button.setEnabled(False)
        self.stop_button.setEnabled(True)
        self.open_results_button.setEnabled(False)
        self.start_time = time.time()
        self.timer.start()
        output_root = Path(self.output_root_input.text().strip())
        output_root.mkdir(parents=True, exist_ok=True)
        crawl_config = self._collect_config()
        self.runner = KatanaRunner(target, output_root, crawl_config)
        self.thread = CrawlThread(self.runner)
        self.runner.signals.log.connect(self.append_log)
        self.runner.signals.error.connect(self.append_log)
        self.runner.signals.progress.connect(self.update_progress)
        self.runner.signals.completed.connect(self.crawl_completed)
        self.runner.signals.failed.connect(self.crawl_failed)
        self.thread.finished.connect(self.thread.deleteLater)
        self.thread.start()

    def stop_crawl(self) -> None:
        if self.runner:
            self.runner.stop()
        self.stop_button.setEnabled(False)
        self.append_log("Stopping crawl...")

    def append_log(self, line: str) -> None:
        if not line:
            return
        self.log_lines.append(line)
        if len(self.log_lines) > 500:
            self.log_lines = self.log_lines[-500:]
        self.log_view.setPlainText("\n".join(self.log_lines))
        self.log_view.verticalScrollBar().setValue(self.log_view.verticalScrollBar().maximum())

    def update_progress(self, payload: Dict) -> None:
        kind = payload.get("kind")
        if kind in self.counts:
            self.counts[kind] += 1
            self._update_counts()

    def crawl_completed(self, run_dir: Path) -> None:
        self.timer.stop()
        self.run_button.setEnabled(True)
        self.stop_button.setEnabled(False)
        self.open_results_button.setEnabled(True)
        self.last_run_dir = run_dir
        self.append_log(f"Crawl completed. Results in {run_dir}")
        self._load_results(run_dir)
        self._save_config()

    def crawl_failed(self, message: str) -> None:
        self.timer.stop()
        self.run_button.setEnabled(True)
        self.stop_button.setEnabled(False)
        self.append_log(f"Crawl failed: {message}")
        self._save_config()

    def _load_results(self, run_dir: Path) -> None:
        self.pages_data = []
        self.assets_data = []
        self.xhr_data = []
        pages_path = run_dir / "pages.jsonl"
        if pages_path.exists():
            for line in pages_path.read_text(encoding="utf-8").splitlines():
                if not line:
                    continue
                self.pages_data.append(json.loads(line))
        assets_path = run_dir / "assets.txt"
        if assets_path.exists():
            for line in assets_path.read_text(encoding="utf-8").splitlines():
                if not line:
                    continue
                self.assets_data.append({"url": line, "type": asset_type_from_url(line)})
        xhr_path = run_dir / "xhr.jsonl"
        if xhr_path.exists():
            for line in xhr_path.read_text(encoding="utf-8").splitlines():
                if not line:
                    continue
                self.xhr_data.append(json.loads(line))
        errors_path = run_dir / "errors.log"
        if errors_path.exists():
            self.errors_view.setPlainText(errors_path.read_text(encoding="utf-8"))
        self._populate_tables()

    def _populate_tables(self) -> None:
        self.pages_table.setRowCount(0)
        for page in self.pages_data:
            row = self.pages_table.rowCount()
            self.pages_table.insertRow(row)
            self.pages_table.setItem(row, 0, QTableWidgetItem(page.get("url", "")))
            self.pages_table.setItem(row, 1, QTableWidgetItem(page.get("title", "")))
            self.pages_table.setItem(row, 2, QTableWidgetItem(page.get("description", "")))
            self.pages_table.setItem(row, 3, QTableWidgetItem(page.get("og_video", "")))
            self.pages_table.setItem(row, 4, QTableWidgetItem(page.get("og_image", "")))
            self.pages_table.setItem(row, 5, QTableWidgetItem(page.get("content_type", "")))
        self.assets_table.setRowCount(0)
        for asset in self.assets_data:
            row = self.assets_table.rowCount()
            self.assets_table.insertRow(row)
            self.assets_table.setItem(row, 0, QTableWidgetItem(asset.get("url", "")))
            self.assets_table.setItem(row, 1, QTableWidgetItem(asset.get("type", "")))
        self.xhr_table.setRowCount(0)
        for xhr in self.xhr_data:
            row = self.xhr_table.rowCount()
            self.xhr_table.insertRow(row)
            self.xhr_table.setItem(row, 0, QTableWidgetItem(xhr.get("url", "")))
            self.xhr_table.setItem(row, 1, QTableWidgetItem(xhr.get("method", "")))
        self.apply_filter(self.filter_input.text())

    def apply_filter(self, text: str) -> None:
        text = text.lower().strip()
        table = self._current_table()
        if not table:
            return
        for row in range(table.rowCount()):
            match = False
            for col in range(table.columnCount()):
                item = table.item(row, col)
                if item and text in item.text().lower():
                    match = True
                    break
            table.setRowHidden(row, bool(text) and not match)

    def _current_table(self) -> Optional[QTableWidget]:
        current = self.tabs.currentWidget()
        if current in (self.pages_table, self.assets_table, self.xhr_table):
            return current
        return None

    def export_csv(self) -> None:
        table = self._current_table()
        if not table:
            return
        path, _ = QFileDialog.getSaveFileName(self, "Export CSV", "", "CSV Files (*.csv)")
        if not path:
            return
        with open(path, "w", encoding="utf-8", newline="") as handle:
            for row in range(table.rowCount()):
                if table.isRowHidden(row):
                    continue
                values = []
                for col in range(table.columnCount()):
                    item = table.item(row, col)
                    values.append(item.text() if item else "")
                handle.write(",".join(value.replace(",", " ") for value in values) + "\n")

    def export_json(self) -> None:
        tab = self.tabs.currentWidget()
        path, _ = QFileDialog.getSaveFileName(self, "Export JSON", "", "JSON Files (*.json)")
        if not path:
            return
        if tab is self.pages_table:
            data = self.pages_data
        elif tab is self.assets_table:
            data = self.assets_data
        elif tab is self.xhr_table:
            data = self.xhr_data
        else:
            return
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)

    def open_results(self) -> None:
        if self.last_run_dir:
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(self.last_run_dir)))

    def browse_katana(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, "Select katana binary")
        if path:
            self.katana_path_input.setText(path)
            self._update_katana_status()

    def browse_output_root(self) -> None:
        path = QFileDialog.getExistingDirectory(self, "Select output folder")
        if path:
            self.output_root_input.setText(path)

    def _reset_state(self) -> None:
        self.counts = {"urls": 0, "pages": 0, "assets": 0, "xhr": 0}
        self._update_counts()
        self.log_lines = []
        self.log_view.clear()
        self.pages_table.setRowCount(0)
        self.assets_table.setRowCount(0)
        self.xhr_table.setRowCount(0)
        self.errors_view.clear()

    def _update_counts(self) -> None:
        self.urls_label.setText(f"URLs: {self.counts['urls']}")
        self.pages_label.setText(f"Pages: {self.counts['pages']}")
        self.assets_label.setText(f"Assets: {self.counts['assets']}")
        self.xhr_label.setText(f"XHR: {self.counts['xhr']}")

    def _update_elapsed(self) -> None:
        if not self.thread or not self.thread.isRunning():
            self.elapsed_label.setText("Elapsed: 00:00:00")
            return
        if self.start_time is None:
            return
        elapsed_seconds = int(time.time() - self.start_time)
        hours, remainder = divmod(elapsed_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        self.elapsed_label.setText(
            f"Elapsed: {hours:02d}:{minutes:02d}:{seconds:02d}"
        )

    def _save_config(self) -> None:
        self.config.last_target = self.target_input.text().strip()
        self.config.output_root = self.output_root_input.text().strip()
        self.config.crawl = self._collect_config()
        save_config(self.config)

    def closeEvent(self, event) -> None:
        self._save_config()
        super().closeEvent(event)


def main() -> None:
    if platform.system().lower() != "windows":
        print("This application is supported on Windows only.")
        sys.exit(1)
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
