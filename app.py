"""
Bitbucket Manager — standalone desktop application.
Uses pywebview for a native window with embedded HTML/CSS UI.
"""

import os
import sys
import webview
from bitbucket_api import BitbucketAPI


def get_resource_path(relative):
    """Resolve a resource path, handling both dev and PyInstaller contexts."""
    if getattr(sys, "_MEIPASS", None):
        return os.path.join(sys._MEIPASS, relative)
    return os.path.join(os.path.dirname(__file__), relative)


def main():
    api = BitbucketAPI()
    icon_path = get_resource_path("icon.ico")

    window = webview.create_window(
        title="Bitbucket Manager",
        url=get_resource_path(os.path.join("ui", "index.html")),
        js_api=api,
        width=1100,
        height=750,
        min_size=(900, 600),
    )

    webview.start(
        debug=("--debug" in sys.argv),
        icon=icon_path if os.path.exists(icon_path) else None,
    )


if __name__ == "__main__":
    main()
