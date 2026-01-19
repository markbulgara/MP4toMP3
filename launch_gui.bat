@echo off
setlocal
where /q pythonw
if %errorlevel%==0 (
  pythonw launch_gui.py
) else (
  python launch_gui.py
)
