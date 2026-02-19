"""
Build script for Bitbucket Manager.
Creates a standalone .exe using PyInstaller.

Usage:
    python build.py
"""

import PyInstaller.__main__
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

args = [
    os.path.join(BASE_DIR, "app.py"),
    "--name=BitbucketManager",
    "--onefile",
    "--windowed",
    "--add-data", f"{os.path.join(BASE_DIR, 'ui')};ui",
]

# Add icon if it exists
icon_path = os.path.join(BASE_DIR, "icon.ico")
if os.path.exists(icon_path):
    args.extend(["--icon", icon_path])
    args.extend(["--add-data", f"{icon_path};."])

# Clean previous builds
args.append("--clean")

print("Building BitbucketManager.exe ...")
PyInstaller.__main__.run(args)
print("\nDone! Executable is at: dist/BitbucketManager.exe")
