// ── DOM refs ────────────────────────────────────────────────
const archiveNameInput = document.getElementById('archiveName');
const extSelect        = document.getElementById('extSelect');
const outputPathInput  = document.getElementById('outputPath');
const btnSelectOutput  = document.getElementById('btnSelectOutput');
const fileList         = document.getElementById('fileList');
const fileListWrapper  = document.querySelector('.file-list-wrapper');
const btnAddFiles      = document.getElementById('btnAddFiles');
const btnRemoveFiles   = document.getElementById('btnRemoveFiles');
const btnArchive       = document.getElementById('btnArchive');

// ── State ───────────────────────────────────────────────────
let files = [];          // array of absolute paths
let outputDir = '';      // directory portion of the output path

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

/** Rebuild outputPath from outputDir + archiveName. */
function rebuildOutputPath() {
  if (outputDir) {
    const sep = outputDir.endsWith('\\') || outputDir.endsWith('/') ? '' : '\\';
    outputPathInput.value = outputDir + sep + archiveNameInput.value;
  }
}

/** Parse a full path into { dir, base }. */
function splitPath(fullPath) {
  const sepIdx = Math.max(fullPath.lastIndexOf('\\'), fullPath.lastIndexOf('/'));
  if (sepIdx === -1) return { dir: '', base: fullPath };
  return { dir: fullPath.slice(0, sepIdx), base: fullPath.slice(sepIdx + 1) };
}

// Set a sensible initial output directory (user Desktop)
(async function initDefaults() {
  try {
    const desktopPath = await window.electronAPI.getDesktopPath();
    outputDir = desktopPath;
    rebuildOutputPath();
  } catch (err) {
    console.error('Failed to get desktop path:', err);
    outputDir = '';
    outputPathInput.value = '';
  }
})();

// ── Three-way sync logic ────────────────────────────────────

// 1. Archive name input → update dropdown + output path
archiveNameInput.addEventListener('input', () => {
  const name = archiveNameInput.value;
  const ext = parseArchiveExt(name);
  if (ext && EXT_MAP[ext]) {
    extSelect.value = EXT_MAP[ext];
  }
  rebuildOutputPath();
});

// 2. Extension dropdown → update archive name + output path
extSelect.addEventListener('change', () => {
  const base = stripExt(archiveNameInput.value);
  archiveNameInput.value = base + extFromDropdown();
  rebuildOutputPath();
});

// 3. Output path input → update archive name + dropdown
outputPathInput.addEventListener('input', () => {
  const { dir, base } = splitPath(outputPathInput.value);
  outputDir = dir;
  archiveNameInput.value = base;
  const ext = parseArchiveExt(base);
  if (ext && EXT_MAP[ext]) {
    extSelect.value = EXT_MAP[ext];
  }
});

// ── Select output button ────────────────────────────────────
btnSelectOutput.addEventListener('click', async () => {
  const defaultName = archiveNameInput.value || ('archive' + extFromDropdown());
  const result = await window.electronAPI.selectOutput(defaultName);
  if (!result) return;

  outputPathInput.value = result;
  const { dir, base } = splitPath(result);
  outputDir = dir;
  archiveNameInput.value = base;

  const ext = parseArchiveExt(base);
  if (ext && EXT_MAP[ext]) {
    extSelect.value = EXT_MAP[ext];
  }
});

// ── File list management ────────────────────────────────────

function renderFileList() {
  fileList.innerHTML = '';
  if (files.length === 0) {
    const li = document.createElement('li');
    li.className = 'placeholder';
    li.textContent = 'Drag files here';
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
    alert('No files selected.');
    return;
  }
  const out = outputPathInput.value.trim();
  if (!out) {
    alert('Please specify an output path.');
    return;
  }

  const format = extSelect.value; // "zip" | "tar" | "tar.gz"

  btnArchive.disabled = true;
  btnArchive.textContent = 'Archiving…';
  try {
    const result = await window.electronAPI.createArchive({
      files,
      outputPath: out,
      format,
    });
    alert(`Archive created successfully!\nSize: ${(result.bytes / 1024).toFixed(1)} KB`);
  } catch (err) {
    alert('Error creating archive:\n' + (err.message || err));
  } finally {
    btnArchive.disabled = false;
    btnArchive.textContent = 'Archive';
  }
});
