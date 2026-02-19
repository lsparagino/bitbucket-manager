# Bitbucket Manager

A standalone Windows desktop application for managing your Bitbucket repositories. Navigate workspaces, projects, and repositories — create new repos, fork existing ones, and get ready-to-use `git clone` commands.

![Python](https://img.shields.io/badge/Python-3.9+-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Browse** your Bitbucket workspaces, projects, and repositories
- **Create** new repositories with language, description, and privacy settings
- **Fork** existing repositories to any of your workspaces
- **Git commands** — get SSH and HTTPS clone commands with one-click copy
- **Atlassian-inspired** UI with Bitbucket's design language

## Prerequisites

- Python 3.9 or higher
- A [Bitbucket API Token](https://id.atlassian.com/manage-profile/security/api-tokens) with the following scopes:

  | Level | Scope |
  |-------|-------|
  | **Admin** | `admin:repository:bitbucket` |
  | **Read** | `read:account` |
  | | `read:me` |
  | | `read:project:bitbucket` |
  | | `read:repository:bitbucket` |
  | | `read:user:bitbucket` |
  | | `read:workspace:bitbucket` |
  | **Write** | `write:repository:bitbucket` |

## Installation

```bash
# Clone this repository
git clone <repo-url>
cd bitbucket-manager

# Install dependencies
pip install -r requirements.txt
```

## Usage

### Run from source

```bash
python app.py
```

The application window will open. Sign in with your Bitbucket **API token**.

### Debug mode

```bash
python app.py --debug
```

Opens with developer tools enabled for debugging.

## Building an Executable

Build a standalone `.exe` that can be shared and run without Python installed:

```bash
python build.py
```

The executable will be at `dist/BitbucketManager.exe`.

Alternatively, run PyInstaller manually:

```bash
pyinstaller --onefile --windowed --name BitbucketManager --icon icon.ico --add-data "ui;ui" --add-data "icon.ico;." app.py
```

### Build options

| Flag | Description |
|------|-------------|
| `--onefile` | Bundle everything into a single `.exe` |
| `--windowed` | No console window |
| `--icon icon.ico` | Custom icon (optional) |
| `--name BitbucketManager` | Output filename |

## Project Structure

```
bitbucket-manager/
├── app.py              # Entry point — creates the pywebview window
├── bitbucket_api.py    # Bitbucket API client (exposed to JS via bridge)
├── build.py            # PyInstaller build script
├── icon.ico            # Application icon
├── ui/
│   ├── index.html      # HTML shell
│   ├── css/
│   │   ├── tokens.css      # Design tokens, reset, base layout
│   │   ├── components.css  # Cards, tables, buttons, forms
│   │   └── views.css       # Login, modal, toast, animations
│   └── js/
│       └── app.js      # Application logic
├── requirements.txt    # Python dependencies
└── README.md
```

## How It Works

The app uses [pywebview](https://pywebview.flowrl.com/) to create a native desktop window with an embedded web renderer. The UI is written in HTML/CSS/JS and communicates with the Python backend through pywebview's JavaScript-Python bridge — no HTTP server needed.

```
┌─────────────────────────────┐
│      Native Window          │
│  ┌───────────────────────┐  │
│  │  HTML/CSS/JS UI       │  │
│  │  (Atlassian styling)  │  │
│  └──────────┬────────────┘  │
│             │ JS Bridge     │
│  ┌──────────▼────────────┐  │
│  │  Python Backend       │  │
│  │  (requests → API)     │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```
