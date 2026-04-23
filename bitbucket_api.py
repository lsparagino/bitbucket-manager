"""
Bitbucket API client exposed to the pywebview JS bridge.
All public methods are callable from JavaScript.

Auth uses API Tokens (App Passwords are deprecated since Jun 2025).
Credentials are persisted in %APPDATA%/BitbucketManager/credentials.json.
"""

import requests
import re
import os
import json
import time

# Static username for API Token auth (used as fallback)
_TOKEN_AUTH_USER = "x-bitbucket-api-token-auth"

# Credential storage path
_APP_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "BitbucketManager")
_CRED_FILE = os.path.join(_APP_DIR, "credentials.json")


def _save_credentials(email, token):
    """Persist credentials to disk."""
    os.makedirs(_APP_DIR, exist_ok=True)
    with open(_CRED_FILE, "w") as f:
        json.dump({"email": email, "token": token}, f)


def _load_credentials():
    """Load credentials from disk. Returns (email, token) or (None, None)."""
    try:
        with open(_CRED_FILE, "r") as f:
            data = json.load(f)
            return data.get("email", ""), data.get("token", "")
    except (FileNotFoundError, json.JSONDecodeError):
        return None, None


def _clear_credentials():
    """Delete stored credentials."""
    try:
        os.remove(_CRED_FILE)
    except FileNotFoundError:
        pass





class BitbucketAPI:
    BASE_URL = "https://api.bitbucket.org/2.0"

    def __init__(self):
        self._session = requests.Session()
        self._username = None
        self._email = None
        self._authenticated = False
        self._token = None

    # ── Auth ──────────────────────────────────────────────────────────

    def check_saved_credentials(self):
        """Check if we have saved credentials and auto-login."""
        email, token = _load_credentials()
        if email and token:
            return self.login(token, email, save=False)
        return {"ok": False, "no_saved": True}

    def login(self, api_token, email="", save=True):
        """
        Validate an API token and return user info.
        Tries multiple auth strategies in order.
        """
        url = f"{self.BASE_URL}/user"
        strategies = []

        # Strategy 1: email + token (Basic Auth) — preferred
        if email:
            strategies.append({
                "name": f"Basic Auth (email)",
                "headers": {},
                "auth": (email, api_token),
            })

        # Strategy 2: Bearer token
        strategies.append({
            "name": "Bearer token",
            "headers": {"Authorization": f"Bearer {api_token}"},
            "auth": None,
        })

        # Strategy 3: static username (Basic Auth)
        strategies.append({
            "name": f"Basic Auth ({_TOKEN_AUTH_USER})",
            "headers": {},
            "auth": (_TOKEN_AUTH_USER, api_token),
        })

        debug_attempts = []
        for strat in strategies:
            print(f"[AUTH] Trying: {strat['name']}")
            try:
                resp = self._session.get(
                    url,
                    auth=strat["auth"],
                    headers=strat["headers"],
                    timeout=15,
                )
                if resp.status_code == 200:
                    print(f"[AUTH] OK - Success with: {strat['name']}")
                    self._session.auth = strat["auth"]
                    if strat["headers"]:
                        self._session.headers.update(strat["headers"])
                    self._authenticated = True
                    self._token = api_token
                    self._email = email
                    user = resp.json()
                    self._username = user.get("username", "")

                    # Persist credentials on success
                    if save:
                        _save_credentials(email, api_token)

                    return {
                        "ok": True,
                        "auth_method": strat["name"],
                        "user": {
                            "display_name": user.get("display_name", ""),
                            "username": self._username,
                            "avatar": user.get("links", {})
                            .get("avatar", {})
                            .get("href", ""),
                        },
                    }
                else:
                    debug_attempts.append(
                        f"{strat['name']}: HTTP {resp.status_code}"
                    )
            except requests.RequestException as e:
                debug_attempts.append(f"{strat['name']}: {e}")

        # All strategies failed
        self._session.auth = None
        return {
            "ok": False,
            "error": "All auth methods failed",
            "debug": {
                "attempts": debug_attempts,
                "token_prefix": api_token[:12] + "...",
                "email_provided": bool(email),
            },
        }

    def logout(self):
        """Clear credentials from memory and disk."""
        self._session.auth = None
        self._session.headers.pop("Authorization", None)
        self._username = None
        self._email = None
        self._token = None
        self._authenticated = False
        _clear_credentials()
        return {"ok": True}

    def is_authenticated(self):
        return {"authenticated": self._authenticated, "username": self._username}

    # ── Workspaces ───────────────────────────────────────────────────

    def get_workspaces(self):
        """List all workspaces the user belongs to.

        Uses /user/workspaces. Both /2.0/workspaces and
        /2.0/user/permissions/workspaces were sunset by CHANGE-2770 on
        2026-04-14 and return 410. Entries come back as
        {type, administrator, workspace: {...}}; unwrap the nested workspace.
        """
        result = self._paginated_get("/user/workspaces")
        if not result.get("ok"):
            return result
        values = []
        for entry in result.get("values", []):
            ws = entry.get("workspace") or {}
            if "administrator" in entry:
                ws["administrator"] = entry["administrator"]
            values.append(ws)
        return {"ok": True, "values": values}

    # ── Projects ─────────────────────────────────────────────────────

    def get_projects(self, workspace):
        """List all projects in a workspace."""
        return self._paginated_get(f"/workspaces/{workspace}/projects")

    # ── Repositories ───────────────────────────────────────────────

    _PAGE_SIZE = 10

    def get_repositories(self, workspace, page=1, project_key=None):
        """Fetch one page of repositories, sorted by last updated descending."""
        params = {
            "sort": "-updated_on",
            "pagelen": self._PAGE_SIZE,
            "page": page,
        }
        if project_key:
            params["q"] = f'project.key="{project_key}"'

        try:
            resp = self._session.get(
                f"{self.BASE_URL}/repositories/{workspace}",
                params=params,
                timeout=15,
            )
            if resp.status_code != 200:
                return {"ok": False, "error": f"API error ({resp.status_code})"}

            data = resp.json()
            total = data.get("size", 0)
            pages = max(1, -(-total // self._PAGE_SIZE))  # ceil division
            repos = [self._format_repo(r) for r in data.get("values", [])]

            return {
                "ok": True,
                "values": repos,
                "page": page,
                "pages": pages,
                "total": total,
            }
        except requests.RequestException as e:
            return {"ok": False, "error": str(e)}

    def create_repository(self, workspace, repo_name, project_key=None,
                          is_private=True, language="", description=""):
        """Create a new repository and return git commands."""
        slug = self._slugify(repo_name)
        body = {
            "scm": "git",
            "is_private": is_private,
            "name": repo_name,
            "description": description,
        }
        if project_key:
            body["project"] = {"key": project_key}
        if language:
            body["language"] = language

        try:
            resp = self._session.post(
                f"{self.BASE_URL}/repositories/{workspace}/{slug}",
                json=body,
                timeout=30,
            )
            if resp.status_code in (200, 201):
                repo = resp.json()
                return {
                    "ok": True,
                    "repo": self._format_repo(repo),
                    "commands": self._git_commands(workspace, slug),
                }
            else:
                error = resp.json().get("error", {}).get("message", resp.text)
                return {"ok": False, "error": error}
        except requests.RequestException as e:
            return {"ok": False, "error": str(e)}

    def fork_repository(self, workspace, repo_slug, fork_name=None,
                        target_workspace=None, is_private=True):
        """Fork a repository and return git commands with upstream remote."""
        body = {"type": "repository"}
        if fork_name:
            body["name"] = fork_name
        if target_workspace:
            body["workspace"] = {"slug": target_workspace}
        if is_private is not None:
            body["is_private"] = is_private

        try:
            resp = self._session.post(
                f"{self.BASE_URL}/repositories/{workspace}/{repo_slug}/forks",
                json=body,
                timeout=30,
            )
            if resp.status_code in (200, 201):
                fork = resp.json()
                fork_ws = fork.get("workspace", {}).get("slug", target_workspace or workspace)
                fork_slug = fork.get("slug", fork_name or repo_slug)
                commands = self._git_commands(fork_ws, fork_slug)
                commands["upstream_ssh"] = f"git remote add upstream git@bitbucket.org:{workspace}/{repo_slug}.git"
                commands["upstream_https"] = (
                    f"git remote add upstream https://bitbucket.org/{workspace}/{repo_slug}.git"
                )
                return {
                    "ok": True,
                    "repo": self._format_repo(fork),
                    "commands": commands,
                }
            else:
                error = resp.json().get("error", {}).get("message", resp.text)
                return {"ok": False, "error": error}
        except requests.RequestException as e:
            return {"ok": False, "error": str(e)}

    # ── Helpers ──────────────────────────────────────────────────────

    def _paginated_get(self, path, params=None):
        """Fetch all pages of a paginated endpoint."""
        url = f"{self.BASE_URL}{path}"
        all_values = []
        try:
            while url:
                resp = self._session.get(url, params=params, timeout=15)
                params = None  # only use params on the first request
                if resp.status_code != 200:
                    body = resp.text[:300].replace("\n", " ")
                    err = f"API error ({resp.status_code}) on {resp.url} — {body}"
                    print(f"[API] {err}")
                    return {"ok": False, "error": err}
                data = resp.json()
                all_values.extend(data.get("values", []))
                url = data.get("next")
            return {"ok": True, "values": all_values}
        except requests.RequestException as e:
            return {"ok": False, "error": str(e)}

    def _git_commands(self, workspace, slug):
        return {
            "clone_ssh": f"git clone git@bitbucket.org:{workspace}/{slug}.git",
            "clone_https": f"git clone https://bitbucket.org/{workspace}/{slug}.git",
            "remote_ssh": f"git remote add origin git@bitbucket.org:{workspace}/{slug}.git",
            "remote_https": f"git remote add origin https://bitbucket.org/{workspace}/{slug}.git",
        }

    @staticmethod
    def _slugify(name):
        slug = name.lower().strip()
        slug = re.sub(r"[^a-z0-9\-_]", "-", slug)
        slug = re.sub(r"-+", "-", slug).strip("-")
        return slug

    @staticmethod
    def _format_repo(repo):
        return {
            "name": repo.get("name", ""),
            "slug": repo.get("slug", ""),
            "full_name": repo.get("full_name", ""),
            "description": repo.get("description", ""),
            "is_private": repo.get("is_private", True),
            "language": repo.get("language", ""),
            "updated_on": repo.get("updated_on", ""),
            "project_key": repo.get("project", {}).get("key", ""),
            "project_name": repo.get("project", {}).get("name", ""),
        }
