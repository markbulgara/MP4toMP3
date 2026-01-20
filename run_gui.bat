@echo off
setlocal

set "BIN_DIR=bin"
set "EXE_PATH=%BIN_DIR%\katana-indexer.exe"

if not exist "%EXE_PATH%" (
  echo Building %EXE_PATH%...
  if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"
  set "CGO_ENABLED=1"
  set "GOFLAGS=-tags sqlite_fts5"
  go build -o "%EXE_PATH%" .\cmd\katana-indexer
  if errorlevel 1 (
    echo Build failed. Please ensure Go is installed and on your PATH.
    echo CGO is required for sqlite3; install a C compiler (MSYS2/MinGW or Visual Studio Build Tools).
    pause
    exit /b 1
  )
)

echo Starting GUI on http://localhost:8080 ...
echo Open this URL in your browser: http://localhost:8080
echo Logs will appear in this window while the server is running.
start "" "%EXE_PATH%" serve --addr :8080
echo Waiting for the GUI process to exit. Close this window when you're done.
pause
exit /b 0
