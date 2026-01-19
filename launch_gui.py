#!/usr/bin/env python3
import sys

from universal_site_video_grid import main


if __name__ == "__main__":
    sys.argv = [sys.argv[0], "--gui"]
    sys.exit(main())
