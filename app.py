"""
Bitbucket Manager — standalone desktop application.
Uses pywebview for a native window with embedded HTML/CSS UI.
"""

import os
import sys
import logging
import webview
from bitbucket_api import BitbucketAPI


def setup_logging():
    """When running as a bundled exe, log to a file next to the exe."""
    if getattr(sys, '_MEIPASS', None):
        log_path = os.path.join(os.path.dirname(sys.executable), 'BitbucketManager.log')
        logging.basicConfig(
            filename=log_path,
            level=logging.DEBUG,
            format='%(asctime)s %(levelname)s %(message)s',
            encoding='utf-8',
        )
        # Redirect stdout/stderr to the log file with UTF-8 encoding
        log_file = open(log_path, 'a', encoding='utf-8', errors='replace')
        sys.stdout = log_file
        sys.stderr = log_file
        logging.info('=== BitbucketManager started ===')
        logging.info(f'Executable: {sys.executable}')
        logging.info(f'_MEIPASS: {sys._MEIPASS}')


def get_resource_path(relative):
    """Resolve a resource path, handling both dev and PyInstaller contexts."""
    if getattr(sys, "_MEIPASS", None):
        return os.path.join(sys._MEIPASS, relative)
    return os.path.join(os.path.dirname(__file__), relative)


def main():
    setup_logging()
    api = BitbucketAPI()
    icon_path = get_resource_path("icon.ico")
    html_path = get_resource_path(os.path.join("ui", "index.html"))

    logging.info(f'HTML path: {html_path}')
    logging.info(f'HTML exists: {os.path.exists(html_path)}')

    # List UI directory contents for debugging
    ui_dir = get_resource_path("ui")
    if os.path.exists(ui_dir):
        for root, dirs, files in os.walk(ui_dir):
            for f in files:
                logging.info(f'  UI file: {os.path.join(root, f)}')

    window = webview.create_window(
        title="Bitbucket Manager",
        url=html_path,
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
