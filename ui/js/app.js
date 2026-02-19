/* ── State ────────────────────────────────────────────────────── */
const state = {
  user: null,
  workspace: null,
  workspaceName: null,
  project: null,
  projectName: null,
  workspaces: [],
};

/* ── pywebview bridge ─────────────────────────────────────────── */
async function api(method, ...args) {
  await waitForPywebview();
  const result = await window.pywebview.api[method](...args);
  return result;
}

function waitForPywebview() {
  return new Promise(resolve => {
    if (window.pywebview && window.pywebview.api) return resolve();
    window.addEventListener('pywebviewready', resolve, { once: true });
  });
}

/* ── Login ────────────────────────────────────────────────────── */
async function doLogin() {
  const token = $('login-token').value.trim();
  const email = $('login-email').value.trim();
  if (!token) { showLoginError('Please enter your API token'); return; }

  $('login-btn').textContent = 'Signing in…';
  $('login-btn').disabled = true;

  const result = await api('login', token, email);
  handleLoginResult(result);
  $('login-btn').textContent = 'Sign in';
  $('login-btn').disabled = false;
}

function handleLoginResult(result) {
  if (result.ok) {
    state.user = result.user;
    $('user-display-name').textContent = result.user.display_name;
    $('view-login').classList.add('hidden');
    $('app-shell').classList.remove('hidden');
    loadWorkspaces();
  } else if (!result.no_saved) {
    let msg = result.error;
    if (result.debug) {
      msg += '\n\nAttempted methods:';
      if (result.debug.attempts) {
        result.debug.attempts.forEach(a => { msg += '\n  ✗ ' + a; });
      }
      msg += '\n\nToken prefix: ' + (result.debug.token_prefix || '?');
      msg += '\nEmail provided: ' + (result.debug.email_provided ? 'yes' : 'no');
    }
    showLoginError(msg);
  }
}

function showLoginError(msg) {
  const el = $('login-error');
  el.style.whiteSpace = 'pre-wrap';
  el.style.fontFamily = 'monospace';
  el.style.fontSize = '12px';
  el.textContent = msg;
  el.style.display = 'block';
}

async function doLogout() {
  await api('logout');
  state.user = null;
  state.workspace = null;
  state.project = null;
  $('app-shell').classList.add('hidden');
  $('view-login').classList.remove('hidden');
  $('login-token').value = '';
  $('login-email').value = '';
  $('login-error').style.display = 'none';

}

// Auto-login from saved credentials + Enter key flow
document.addEventListener('DOMContentLoaded', async () => {
  $('login-email').addEventListener('keydown', e => { if (e.key === 'Enter') $('login-token').focus(); });
  $('login-token').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  // Try auto-login from saved credentials
  const result = await api('check_saved_credentials');
  handleLoginResult(result);
});

/* ── Workspaces ───────────────────────────────────────────────── */
async function loadWorkspaces() {
  state.workspace = null;
  state.project = null;

  setBreadcrumbs([{ label: 'Workspaces' }]);
  showLoading();

  const result = await api('get_workspaces');
  if (!result.ok) { showError(result.error); return; }

  state.workspaces = result.values;

  const html = `
    <div class="content-header"><h1>Your Workspaces</h1></div>
    <div class="card-grid">
      ${result.values.map(ws => `
        <div class="card" onclick="loadProjects('${ws.slug}', '${esc(ws.name)}')">
          <div class="card-header">
            <div class="card-avatar">
              ${ws.links?.avatar?.href
      ? `<img src="${ws.links.avatar.href}" alt="">`
      : ws.name?.charAt(0)?.toUpperCase() || 'W'}
            </div>
            <div>
              <div class="card-title">${esc(ws.name)}</div>
              <div class="card-slug">${esc(ws.slug)}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  $('main-content').innerHTML = html;
}

/* ── Projects ─────────────────────────────────────────────────── */
async function loadProjects(workspace, workspaceName) {
  state.workspace = workspace;
  state.workspaceName = workspaceName;
  state.project = null;

  setBreadcrumbs([
    { label: 'Workspaces', onclick: 'loadWorkspaces()' },
    { label: workspaceName },
  ]);
  showLoading();

  const result = await api('get_projects', workspace);
  if (!result.ok) { showError(result.error); return; }

  // Add "All Repos" card
  let html = `
    <div class="content-header">
      <h1>Projects in ${esc(workspaceName)}</h1>
    </div>
    <div class="card-grid">
      <div class="card" onclick="loadRepos('${workspace}', '${esc(workspaceName)}', null, 'All Repositories')">
        <div class="card-header">
          <div class="card-avatar" style="background: var(--green-50); color: var(--green-500);">∞</div>
          <div>
            <div class="card-title">All Repositories</div>
            <div class="card-slug">Browse all repos in this workspace</div>
          </div>
        </div>
      </div>
      ${result.values.map(p => `
        <div class="card" onclick="loadRepos('${workspace}', '${esc(workspaceName)}', '${esc(p.key)}', '${esc(p.name)}')">
          <div class="card-header">
            <div class="card-avatar">${(p.name || p.key || 'P').charAt(0).toUpperCase()}</div>
            <div>
              <div class="card-title">${esc(p.name)}</div>
              <div class="card-slug">${esc(p.key)}</div>
            </div>
          </div>
          ${p.description ? `<div class="card-desc">${esc(p.description)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
  $('main-content').innerHTML = html;
}

/* ── Repositories ─────────────────────────────────────────────── */
async function loadRepos(workspace, workspaceName, projectKey, projectName, page = 1) {
  state.workspace = workspace;
  state.workspaceName = workspaceName;
  state.project = projectKey;
  state.projectName = projectName;

  setBreadcrumbs([
    { label: 'Workspaces', onclick: 'loadWorkspaces()' },
    { label: workspaceName, onclick: `loadProjects('${workspace}', '${esc(workspaceName)}')` },
    { label: projectName },
  ]);
  showLoading();

  const result = await api('get_repositories', workspace, page, projectKey || '');
  if (!result.ok) { showError(result.error); return; }

  const repos = result.values;
  let html = `
    <div class="content-header">
      <h1>${esc(projectName)} <span style="font-size:14px;font-weight:400;color:var(--neutral-300)">(${result.total} repos)</span></h1>
      <button class="btn btn-primary" onclick="openCreateRepoModal()">＋ Create Repository</button>
    </div>
  `;

  if (repos.length === 0) {
    html += `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        <h3>No repositories yet</h3>
        <p>Create your first repository to get started.</p>
      </div>
    `;
  } else {
    html += `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Repository</th>
              <th>Language</th>
              <th>Updated</th>
              <th>Visibility</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${repos.map(r => `
              <tr>
                <td>
                  <div class="repo-name">${esc(r.name)}</div>
                  ${r.description ? `<div class="repo-desc">${esc(r.description)}</div>` : ''}
                </td>
                <td>${r.language ? `<span class="card-badge badge-lang">${esc(r.language)}</span>` : '—'}</td>
                <td class="repo-date">${r.updated_on ? formatDate(r.updated_on) : '—'}</td>
                <td><span class="card-badge ${r.is_private ? 'badge-private' : 'badge-public'}">${r.is_private ? 'Private' : 'Public'}</span></td>
                <td>
                  <div class="action-btns">
                    <button class="btn btn-secondary btn-sm" onclick="showCloneCommands('${esc(r.full_name)}', '${workspace}', '${esc(r.slug)}')">Clone</button>
                    <button class="btn btn-secondary btn-sm" onclick="openForkModal('${workspace}', '${esc(r.slug)}', '${esc(r.name)}')">Fork</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Pagination controls
    if (result.pages > 1) {
      const pk = projectKey ? `'${esc(projectKey)}'` : 'null';
      const pn = `'${esc(projectName)}'`;
      html += `
      <div class="pagination">
        <button class="btn btn-secondary btn-sm" ${result.page <= 1 ? 'disabled' : ''}
                onclick="loadRepos('${workspace}', '${esc(workspaceName)}', ${pk}, ${pn}, ${result.page - 1})">
          ← Previous
        </button>
        <span class="pagination-info">Page ${result.page} of ${result.pages}</span>
        <button class="btn btn-secondary btn-sm" ${result.page >= result.pages ? 'disabled' : ''}
                onclick="loadRepos('${workspace}', '${esc(workspaceName)}', ${pk}, ${pn}, ${result.page + 1})">
          Next →
        </button>
      </div>
    `;
    }
  }
  $('main-content').innerHTML = html;
}

/* ── Git Commands Modal ───────────────────────────────────────── */
function showCloneCommands(fullName, workspace, slug) {
  const body = `
    ${cmdRow('Clone (SSH)', `git clone git@bitbucket.org:${workspace}/${slug}.git`)}
    ${cmdRow('Clone (HTTPS)', `git clone https://bitbucket.org/${workspace}/${slug}.git`)}
    ${cmdRow('Add Remote (SSH)', `git remote add origin git@bitbucket.org:${workspace}/${slug}.git`)}
    ${cmdRow('Add Remote (HTTPS)', `git remote add origin https://bitbucket.org/${workspace}/${slug}.git`)}
  `;
  openModal(`Git Commands — ${fullName}`, body, `
    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
  `);
}

function showPostOpCommands(commands, title) {
  let body = `
    ${cmdRow('Clone (SSH)', commands.clone_ssh)}
    ${cmdRow('Clone (HTTPS)', commands.clone_https)}
  `;
  if (commands.remote_ssh) {
    body += cmdRow('Add Remote (SSH)', commands.remote_ssh);
    body += cmdRow('Add Remote (HTTPS)', commands.remote_https);
  }
  if (commands.upstream_ssh) {
    body += cmdRow('Add Upstream (SSH)', commands.upstream_ssh);
    body += cmdRow('Add Upstream (HTTPS)', commands.upstream_https);
  }
  openModal(title, body, `
    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
  `);
}

function cmdRow(label, cmd) {
  const id = 'cmd-' + Math.random().toString(36).slice(2, 9);
  return `
    <div class="git-cmd">
      <div class="git-cmd-label">${label}</div>
      <div class="git-cmd-row">
        <div class="git-cmd-code" id="${id}">${esc(cmd)}</div>
        <button class="copy-btn" onclick="copyCmd('${id}', this)" title="Copy to clipboard">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>
        </button>
      </div>
    </div>
  `;
}

function copyCmd(id, btn) {
  const text = $(id).textContent;
  navigator.clipboard.writeText(text).then(() => {
    btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>';
      btn.classList.remove('copied');
    }, 2000);
  });
}

/* ── Create Repo Modal ────────────────────────────────────────── */
function openCreateRepoModal() {
  openModal('Create Repository', `
    <div class="form-group">
      <label for="cr-name">Repository name</label>
      <input type="text" id="cr-name" placeholder="my-new-repo">
    </div>
    <div class="form-group">
      <label for="cr-desc">Description</label>
      <textarea id="cr-desc" placeholder="Optional description"></textarea>
    </div>
    <div class="form-group">
      <label for="cr-lang">Language</label>
      <select id="cr-lang">
        <option value="">None</option>
        <option value="python">Python</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option>
        <option value="java">Java</option><option value="c#">C#</option><option value="go">Go</option><option value="rust">Rust</option>
        <option value="php">PHP</option><option value="ruby">Ruby</option><option value="c++">C++</option><option value="c">C</option>
        <option value="swift">Swift</option><option value="kotlin">Kotlin</option><option value="dart">Dart</option><option value="shell">Shell</option>
      </select>
    </div>
    <div class="form-group">
      <div class="toggle-row">
        <label class="toggle"><input type="checkbox" id="cr-private" checked><span class="toggle-slider"></span></label>
        <label for="cr-private" style="margin:0;cursor:pointer">Private repository</label>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" id="cr-submit" onclick="submitCreateRepo()">Create</button>
  `);
}

async function submitCreateRepo() {
  const name = $('cr-name').value.trim();
  if (!name) { toast('Please enter a repository name', 'error'); return; }

  $('cr-submit').textContent = 'Creating…';
  $('cr-submit').disabled = true;

  const result = await api('create_repository',
    state.workspace,
    name,
    state.project || '',
    $('cr-private').checked,
    $('cr-lang').value,
    $('cr-desc').value.trim()
  );

  if (result.ok) {
    closeModal();
    toast('Repository created successfully!', 'success');
    showPostOpCommands(result.commands, `Repository created — ${result.repo.full_name}`);
    // Reload the repo list
    loadRepos(state.workspace, state.workspaceName, state.project, state.projectName);
  } else {
    toast(result.error, 'error');
    $('cr-submit').textContent = 'Create';
    $('cr-submit').disabled = false;
  }
}

/* ── Fork Repo Modal ──────────────────────────────────────────── */
function openForkModal(workspace, repoSlug, repoName) {
  const wsOptions = state.workspaces.map(ws =>
    `<option value="${esc(ws.slug)}" ${ws.slug === workspace ? 'selected' : ''}>${esc(ws.name)}</option>`
  ).join('');

  openModal(`Fork — ${repoName}`, `
    <div class="form-group">
      <label for="fk-name">Fork name</label>
      <input type="text" id="fk-name" value="${esc(repoName)}" placeholder="Fork name">
    </div>
    <div class="form-group">
      <label for="fk-ws">Target workspace</label>
      <select id="fk-ws">${wsOptions}</select>
    </div>
    <div class="form-group">
      <div class="toggle-row">
        <label class="toggle"><input type="checkbox" id="fk-private" checked><span class="toggle-slider"></span></label>
        <label for="fk-private" style="margin:0;cursor:pointer">Private repository</label>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" id="fk-submit" onclick="submitFork('${esc(workspace)}', '${esc(repoSlug)}')">Fork</button>
  `);
}

async function submitFork(workspace, repoSlug) {
  $('fk-submit').textContent = 'Forking…';
  $('fk-submit').disabled = true;

  const result = await api('fork_repository',
    workspace,
    repoSlug,
    $('fk-name').value.trim(),
    $('fk-ws').value,
    $('fk-private').checked
  );

  if (result.ok) {
    closeModal();
    toast('Repository forked successfully!', 'success');
    showPostOpCommands(result.commands, `Forked — ${result.repo.full_name}`);
  } else {
    toast(result.error, 'error');
    $('fk-submit').textContent = 'Fork';
    $('fk-submit').disabled = false;
  }
}

/* ── Modal helpers ────────────────────────────────────────────── */
function openModal(title, bodyHtml, footerHtml) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHtml;
  $('modal-footer').innerHTML = footerHtml;
  $('modal-overlay').classList.add('active');
}
function closeModal() { $('modal-overlay').classList.remove('active'); }

/* ── Breadcrumbs ──────────────────────────────────────────────── */
function setBreadcrumbs(items) {
  $('breadcrumbs').innerHTML = items.map((item, i) => {
    const isLast = i === items.length - 1;
    const sep = i > 0 ? '<span class="sep">/</span>' : '';
    if (isLast) return `${sep}<span class="current">${esc(item.label)}</span>`;
    return `${sep}<a onclick="${item.onclick}">${esc(item.label)}</a>`;
  }).join('');
}

/* ── Utilities ────────────────────────────────────────────────── */
function $(id) { return document.getElementById(id); }

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
}

function showLoading() {
  $('main-content').innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading…</p></div>';
}

function showError(msg) {
  $('main-content').innerHTML = `
    <div class="empty-state">
      <h3>Something went wrong</h3>
      <p>${esc(msg)}</p>
      <button class="btn btn-secondary" style="margin-top:12px" onclick="loadWorkspaces()">Back to Workspaces</button>
    </div>
  `;
}

function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => el.classList.remove('show'), 3500);
}
