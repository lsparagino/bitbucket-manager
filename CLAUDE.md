# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install deps
pip install -r requirements.txt

# Run from source
python app.py

# Run with webview devtools (right-click → Inspect)
python app.py --debug

# Build standalone single-file exe (output: dist/BitbucketManager.exe)
python build.py
```

There is no test suite and no linter configured.

## Architecture

This is a **pywebview desktop app**: a native Windows window wrapping an embedded web renderer. No HTTP server. The Python backend and the HTML/CSS/JS frontend talk over pywebview's JS↔Python bridge.

### The bridge contract

- [app.py](app.py) instantiates `BitbucketAPI()` and passes it as `js_api=` to `webview.create_window`. **Every public (non-underscore) method on `BitbucketAPI` is automatically callable from JavaScript** as `window.pywebview.api.method_name(...)`. Adding a method in Python makes it available in JS with no extra wiring.
- The frontend wraps every call through `api(method, ...args)` in [ui/js/app.js](ui/js/app.js), which awaits a `pywebviewready` event before the first call. Keep this pattern — the bridge isn't ready at `DOMContentLoaded`.
- Backend methods return plain dicts shaped as `{ok: true, ...}` or `{ok: false, error: "..."}`. The frontend branches on `result.ok`. Preserve this shape when adding endpoints.

### Auth (non-obvious)

- **API Tokens only.** App Passwords were deprecated June 2025 and are not supported.
- `BitbucketAPI.login` in [bitbucket_api.py](bitbucket_api.py) tries three auth strategies in order: Basic Auth with the user's email, Bearer token, then Basic Auth with the static `x-bitbucket-api-token-auth` username. Whichever succeeds is pinned onto `self._session` for subsequent calls. If you change auth, preserve the fallback ladder — different Bitbucket endpoints and token types accept different forms.
- Credentials persist to `%APPDATA%/BitbucketManager/credentials.json` as plaintext JSON. `check_saved_credentials` auto-logs-in on startup. There is no OS keychain integration.

### PyInstaller resource paths

When bundled, Python files are unpacked to `sys._MEIPASS`. **Always resolve bundled files via `get_resource_path()` in [app.py](app.py)** — direct `os.path.dirname(__file__)` references break in the exe. The UI directory (`ui/`), `icon.ico`, and `certifi`'s CA bundle must all be bundled; see [build.py](build.py) for the `--add-data` / `--collect-data` invocations. The `.venv` in this repo is used for local runs; PyInstaller resolves imports independently.

Logging in the bundled exe goes to `BitbucketManager.log` next to the exe (stdout/stderr are redirected). In dev runs there is no log file — `print()` goes to the console.

### Pagination split

- Workspaces and projects use `_paginated_get`, which walks `next` links and returns everything.
- Repositories use manual paging via `get_repositories(workspace, page, project_key)` with `_PAGE_SIZE = 10`. The frontend renders pagination controls from the returned `{page, pages, total}`. Don't unify these — the repo list is deliberately paged for UI responsiveness.

### Frontend conventions

Vanilla JS, no framework, no bundler. CSS is split into `tokens.css` (design tokens/reset), `components.css` (cards/tables/buttons), `views.css` (login/modal/toast). State lives in a single `state` object in [ui/js/app.js](ui/js/app.js). User-supplied strings interpolated into HTML templates are run through `esc()` — keep this up when adding new templates, since innerHTML is used throughout.
