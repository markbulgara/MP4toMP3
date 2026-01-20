$ErrorActionPreference = "Stop"

python -m pip install --upgrade pip
pip install -r requirements.txt
pip install pyinstaller

pyinstaller --name KatanaVideoCrawler --noconsole --onefile app/main.py
