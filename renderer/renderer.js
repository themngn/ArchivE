// ── DOM refs ────────────────────────────────────────────────

const extSelect        = document.getElementById('extSelect');
const outputPathInput  = document.getElementById('outputPath');
const btnSelectOutput  = document.getElementById('btnSelectOutput');
const fileList         = document.getElementById('fileList');
const fileListWrapper  = document.querySelector('.file-list-wrapper');
const btnAddFiles      = document.getElementById('btnAddFiles');
const btnRemoveFiles   = document.getElementById('btnRemoveFiles');
const btnArchive       = document.getElementById('btnArchive');
const btnArchiveText   = document.getElementById('btnArchiveText');
const fileCountEl      = document.getElementById('fileCount');
const statusMessageEl  = document.getElementById('statusMessage');

// ── State ───────────────────────────────────────────────────
let files = [];          // array of absolute paths

// ── Status bar ─────────────────────────────────────────────
let _statusTimer;
function showStatus(message, type = 'info') {
  statusMessageEl.textContent = message;
  statusMessageEl.className = message ? `status--${type}` : '';
  clearTimeout(_statusTimer);
  if (message) {
    _statusTimer = setTimeout(() => {
      statusMessageEl.textContent = '';
      statusMessageEl.className = '';
    }, 5000);
  }
}

// Supported extensions mapped to their dropdown values
const EXT_MAP = {
  '.zip':    'zip',
  '.tar':    'tar',
  '.tar.gz': 'tar.gz',
  '.tgz':    'tar.gz',
};

// ── Helpers ─────────────────────────────────────────────────

/** Return the known archive extension at the end of `name`, or null. */
function parseArchiveExt(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.tar.gz')) return '.tar.gz';
  if (lower.endsWith('.tgz'))    return '.tgz';
  if (lower.endsWith('.tar'))    return '.tar';
  if (lower.endsWith('.zip'))    return '.zip';
  return null;
}

/** Strip the archive extension from `name`. */
function stripExt(name) {
  const ext = parseArchiveExt(name);
  return ext ? name.slice(0, -ext.length) : name;
}

/** Build an extension string like ".zip" or ".tar.gz" from the dropdown value. */
function extFromDropdown() {
  const v = extSelect.value; // "zip" | "tar" | "tar.gz"
  return '.' + v;
}

/** Parse a full path into { dir, base }. */
function splitPath(fullPath) {
  const sepIdx = Math.max(fullPath.lastIndexOf('\\'), fullPath.lastIndexOf('/'));
  if (sepIdx === -1) return { dir: '', base: fullPath };
  return { dir: fullPath.slice(0, sepIdx), base: fullPath.slice(sepIdx + 1) };
}

// Set a sensible initial output path (Desktop/archive.zip)
(async function initDefaults() {
  try {
    const desktopPath = await window.electronAPI.getDesktopPath();
    outputPathInput.value = desktopPath + '\\archive.zip';
  } catch (err) {
    console.error('Failed to get desktop path:', err);
    outputPathInput.value = '';
  }
})();

// ── Two-way sync logic ──────────────────────────────────────

// 1. Extension dropdown → swap extension in output path
extSelect.addEventListener('change', () => {
  const { dir, base } = splitPath(outputPathInput.value);
  const newBase = stripExt(base) || 'archive';
  const sep = dir ? '\\' : '';
  outputPathInput.value = (dir ? dir + sep : '') + newBase + extFromDropdown();
});

// 2. Output path input → update dropdown
outputPathInput.addEventListener('input', () => {
  const { base } = splitPath(outputPathInput.value);
  const ext = parseArchiveExt(base);
  if (ext && EXT_MAP[ext]) {
    extSelect.value = EXT_MAP[ext];
  }
});

// 3. Output path input → validate on blur; append selected ext if missing
outputPathInput.addEventListener('blur', () => {
  const val = outputPathInput.value.trim();
  if (!val) return;
  const { dir, base } = splitPath(val);
  const ext = parseArchiveExt(base);
  if (!ext) {
    const sep = dir ? '\\' : '';
    outputPathInput.value = (dir ? dir + sep : '') + base + extFromDropdown();
  }
});

// ── Select output button ────────────────────────────────────
btnSelectOutput.addEventListener('click', async () => {
  const { base } = splitPath(outputPathInput.value);
  const defaultName = (stripExt(base) || 'archive') + extFromDropdown();
  const result = await window.electronAPI.selectOutput(defaultName);
  if (!result) return;

  outputPathInput.value = result;
  const { base: newBase } = splitPath(result);
  const ext = parseArchiveExt(newBase);
  if (ext && EXT_MAP[ext]) {
    extSelect.value = EXT_MAP[ext];
  }
});

// ── File list management ────────────────────────────────────

function renderFileList() {
  fileList.innerHTML = '';
  fileCountEl.textContent = files.length === 0
    ? '0 files'
    : `${files.length} file${files.length !== 1 ? 's' : ''}`;
  if (files.length === 0) {
    const li = document.createElement('li');
    li.className = 'placeholder';
    li.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"
           viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"
           style="margin-bottom: 8px; opacity: 0.35">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="18" x2="12" y2="12"/>
        <line x1="9" y1="15" x2="15" y2="15"/>
      </svg>
      <span>Drop files here or use Add Files</span>`;
    fileList.appendChild(li);
    return;
  }
  for (const f of files) {
    const li = document.createElement('li');
    li.textContent = f;
    li.title = f;
    li.addEventListener('click', (e) => {
      if (!e.ctrlKey) {
        fileList.querySelectorAll('li').forEach((el) => el.classList.remove('selected'));
      }
      li.classList.toggle('selected');
    });
    fileList.appendChild(li);
  }
}

// Add files via dialog
btnAddFiles.addEventListener('click', async () => {
  const selected = await window.electronAPI.openFiles();
  if (!selected || selected.length === 0) return;
  for (const f of selected) {
    if (!files.includes(f)) files.push(f);
  }
  renderFileList();
});

// Remove selected files
btnRemoveFiles.addEventListener('click', () => {
  const selectedLis = fileList.querySelectorAll('li.selected');
  const removePaths = new Set([...selectedLis].map((li) => li.textContent));
  files = files.filter((f) => !removePaths.has(f));
  renderFileList();
});

// ── Drag & drop ─────────────────────────────────────────────

fileListWrapper.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  fileListWrapper.classList.add('drag-over');
});

fileListWrapper.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  fileListWrapper.classList.remove('drag-over');
});

fileListWrapper.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  fileListWrapper.classList.remove('drag-over');

  const droppedFiles = [...e.dataTransfer.files].map((f) => f.path);
  for (const f of droppedFiles) {
    if (!files.includes(f)) files.push(f);
  }
  renderFileList();
});

// ── Archive button ──────────────────────────────────────────
btnArchive.addEventListener('click', async () => {
  if (files.length === 0) {
    showStatus('No files selected. Add files before archiving.', 'error');
    return;
  }
  const out = outputPathInput.value.trim();
  if (!out) {
    showStatus('Please specify an output destination path.', 'error');
    return;
  }

  const format = extSelect.value; // "zip" | "tar" | "tar.gz"

  btnArchive.disabled = true;
  btnArchiveText.textContent = 'Archiving…';
  showStatus('Creating archive…', 'info');
  try {
    const result = await window.electronAPI.createArchive({
      files,
      outputPath: out,
      format,
    });
    showStatus(`Archive created successfully  ·  ${(result.bytes / 1024).toFixed(1)} KB`, 'success');
  } catch (err) {
    showStatus('Error: ' + (err.message || err), 'error');
  } finally {
    btnArchive.disabled = false;
    btnArchiveText.textContent = 'Create Archive';
  }
});
