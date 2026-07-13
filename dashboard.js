/*
 * Copyright 2026 Sando
 * Licensed under the Apache License, Version 2.0
 */

// Twitter/X Block Manager Core Logic

const BEARER_TOKEN = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// State variables
let csrfToken = null;
let sessionDomain = 'x.com';
let exportActive = false;
let exportUsers = [];
let exportCursor = '-1';

let importUsers = []; // Array of objects: { originalIndex: number, target: string, selected: boolean, status: string, name: string, handle: string, bio: string, avatar: string }
let blockActive = false;
let blockIndex = 0;
let blockDelay = 1.5; // seconds
let blockTimeoutId = null;

// Skipping cache state (Blocks)
let blockedIdsSet = new Set();
let blockedNamesSet = new Set();
let fetchedBlockedListForSkipping = false;

// Skipping cache state (Mutes)
let mutedIdsSet = new Set();
let mutedNamesSet = new Set();
let fetchedMutedListForSkipping = false;

// Skipping cache state (Safety Protection Lists)
let followingIdsSet = new Set();
let followingNamesSet = new Set();
let followersIdsSet = new Set();
let followersNamesSet = new Set();
let fetchedFollowingForSkipping = false;
let fetchedFollowersForSkipping = false;

let cachedOwnHandle = null;
let cachedOwnId = null;

// Cooldown interval
let cooldownIntervalId = null;

// Pagination & Sorting State (Import Panel)
let previewPage = 0;
const itemsPerPage = 50;
let sortColumn = 'username';
let sortDirection = 'asc';

// Pagination & Sorting State (Export Panel)
let exportPage = 0;
let exportSortColumn = 'username';
let exportSortDirection = 'asc';
let filteredExportUsers = [];

// UI Elements
const sessionDot = document.getElementById('session-dot');
const sessionText = document.getElementById('session-text');
const consoleEl = document.getElementById('console');

// Export Elements
const btnStartExport = document.getElementById('btn-start-export');
const btnStopExport = document.getElementById('btn-stop-export');
const btnDownloadTxt = document.getElementById('btn-download-txt');
const btnDownloadCsv = document.getElementById('btn-download-csv');
const exportCountEl = document.getElementById('export-count');
const exportStatusEl = document.getElementById('export-status');
const exportSearchContainer = document.getElementById('export-search-container');
const exportSearchInput = document.getElementById('export-search');
const exportTableBody = document.getElementById('export-table-body');
const btnExportPrev = document.getElementById('btn-export-prev');
const btnExportNext = document.getElementById('btn-export-next');
const exportPageInfo = document.getElementById('export-page-info');

// Import / Action Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const dropzonePrompt = document.getElementById('dropzone-prompt');
const importCountEl = document.getElementById('import-count');
const blockDelayInput = document.getElementById('block-delay');
const actionSelect = document.getElementById('action-select');
const previewContainer = document.getElementById('preview-container');
const importTableBody = document.getElementById('import-table-body');
const selectAllImports = document.getElementById('select-all-imports');
const btnImportDownloadTxt = document.getElementById('btn-import-download-txt');
const btnImportDownloadCsv = document.getElementById('btn-import-download-csv');
const chkSkipFollowing = document.getElementById('chk-skip-following');
const chkSkipFollowers = document.getElementById('chk-skip-followers');

// Import Tab Selection Elements
const btnTabFile = document.getElementById('btn-tab-file');
const btnTabFetch = document.getElementById('btn-tab-fetch');
const fetchUserPanel = document.getElementById('fetch-user-panel');
const fetchUsernameInput = document.getElementById('fetch-username-input');
const fetchRelationSelect = document.getElementById('fetch-relation-select');
const btnFetchUsers = document.getElementById('btn-fetch-users');

// Import Pagination Elements
const btnPrevPage = document.getElementById('btn-prev-page');
const btnNextPage = document.getElementById('btn-next-page');
const pageInfo = document.getElementById('page-info');

// Progress & Execution Controls
const progressContainer = document.getElementById('progress-container');
const progressLbl = document.getElementById('progress-lbl') || document.getElementById('progress-meta');
const progressPercent = document.getElementById('progress-percent');
const progressBarFill = document.getElementById('progress-bar-fill');
const rateLimitCountdown = document.getElementById('rate-limit-countdown');
const countdownTimer = document.getElementById('countdown-timer');
const btnStartBlock = document.getElementById('btn-start-block');
const btnStopBlock = document.getElementById('btn-stop-block');



// Import Card Method Tab Selection
btnTabFile.addEventListener('click', () => {
  btnTabFile.classList.add('active');
  btnTabFetch.classList.remove('active');
  dropzone.style.display = 'block';
  fetchUserPanel.style.display = 'none';
});

btnTabFetch.addEventListener('click', () => {
  btnTabFetch.classList.add('active');
  btnTabFile.classList.remove('active');
  dropzone.style.display = 'none';
  fetchUserPanel.style.display = 'flex';
});

// --- Helper Functions ---

// Console logging
function log(message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  
  // Always log to developer console
  console.log(`[${time}] [${type.toUpperCase()}] ${message}`);
  
  // Filter debug messages from the user-facing UI console panel
  if (message.startsWith('[Debug]')) {
    return;
  }
  
  const line = document.createElement('div');
  line.className = `console-line ${type}`;
  line.textContent = `[${time}] ${message}`;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// Format number with commas
function formatNum(num) {
  return num.toLocaleString();
}

// Retrieve CSRF token from cookies
async function initSession() {
  try {
    let authTokenCookie = await chrome.cookies.get({ url: 'https://x.com', name: 'auth_token' });
    sessionDomain = 'x.com';
    if (!authTokenCookie) {
      authTokenCookie = await chrome.cookies.get({ url: 'https://twitter.com', name: 'auth_token' });
      sessionDomain = 'twitter.com';
    }
    
    if (authTokenCookie && authTokenCookie.value) {
      let csrfCookie = await chrome.cookies.get({ url: `https://${sessionDomain}`, name: 'ct0' });
      if (csrfCookie && csrfCookie.value) {
        csrfToken = csrfCookie.value;
        sessionDot.className = 'status-dot active';
        sessionText.textContent = 'Active Session';
        log(`[System] Connected to active ${sessionDomain} session.`, 'success');
        btnStartExport.disabled = false;
        
        let twidCookie = await chrome.cookies.get({ url: `https://${sessionDomain}`, name: 'twid' });
        if (twidCookie && twidCookie.value) {
          const decodedVal = decodeURIComponent(twidCookie.value);
          const match = decodedVal.match(/u=(\d+)/);
          cachedOwnId = match ? match[1] : decodedVal.trim();
          log(`[System] Safety whitelist parsed own user ID: ${cachedOwnId}`, 'info');
        }
        
        const handle = await getOwnHandle();
        if (handle) {
          sessionText.textContent = `Connected: @${handle}`;
        }
        return;
      }
    }
    
    sessionDot.className = 'status-dot error';
    sessionText.textContent = 'No Active Session';
    log('[System] Could not find an active Twitter/X login session. Please log in to x.com first.', 'error');
    btnStartExport.disabled = true;
  } catch (err) {
    sessionDot.className = 'status-dot error';
    sessionText.textContent = 'Disconnected';
    log(`[System] Error accessing cookies: ${err.message}`, 'error');
  }
}

// --- Export Logic ---

function updateExportHeaderSortIndicators() {
  const headers = {
    'username': document.getElementById('eth-handle'),
    'name': document.getElementById('eth-name'),
    'bio': document.getElementById('eth-bio'),
    'id': document.getElementById('eth-id')
  };
  
  for (const col in headers) {
    const th = headers[col];
    if (!th) continue;
    const indicator = th.querySelector('.sort-indicator');
    if (indicator) {
      if (col === exportSortColumn) {
        indicator.textContent = exportSortDirection === 'asc' ? ' ▲' : ' ▼';
      } else {
        indicator.textContent = '';
      }
    }
  }
}

function updateExportPaginationControls() {
  const totalPages = Math.ceil(filteredExportUsers.length / itemsPerPage) || 1;
  exportPageInfo.textContent = `Page ${exportPage + 1} of ${totalPages}`;
  btnExportPrev.disabled = exportPage === 0;
  btnExportNext.disabled = exportPage >= totalPages - 1;
}

function renderExportTable() {
  exportTableBody.innerHTML = '';
  
  const start = exportPage * itemsPerPage;
  const end = Math.min(start + itemsPerPage, filteredExportUsers.length);
  const pageSlice = filteredExportUsers.slice(start, end);
  
  pageSlice.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="user-handle" style="color: var(--accent-color); font-weight: 600;">@${u.screen_name || ''}</span></td>
      <td>
        <div class="user-cell">
          <img class="user-avatar" src="${u.profile_image_url_https || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'}" onerror="this.src='https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'">
          <span class="user-name">${u.name || ''}</span>
        </div>
      </td>
      <td><div class="bio-text" title="${u.description || ''}">${u.description || 'No bio'}</div></td>
      <td><code>${u.id_str || u.id}</code></td>
    `;
    exportTableBody.appendChild(tr);
  });
  
  updateExportHeaderSortIndicators();
  updateExportPaginationControls();
}

function filterAndSortExport() {
  const query = exportSearchInput.value.toLowerCase().trim();
  let result = [...exportUsers];
  
  if (query) {
    result = result.filter(u => 
      (u.screen_name && u.screen_name.toLowerCase().includes(query)) ||
      (u.name && u.name.toLowerCase().includes(query)) ||
      (u.description && u.description.toLowerCase().includes(query)) ||
      (u.id_str && u.id_str.includes(query))
    );
  }
  
  const isAsc = exportSortDirection === 'asc';
  
  if (exportSortColumn === 'username') {
    result.sort((a, b) => {
      const valA = (a.screen_name || '').toLowerCase();
      const valB = (b.screen_name || '').toLowerCase();
      return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  } else if (exportSortColumn === 'name') {
    result.sort((a, b) => {
      const valA = (a.name || '').toLowerCase();
      const valB = (b.name || '').toLowerCase();
      return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  } else if (exportSortColumn === 'id') {
    result.sort((a, b) => {
      const idA = a.id_str ? BigInt(a.id_str) : BigInt(a.id || 0);
      const idB = b.id_str ? BigInt(b.id_str) : BigInt(b.id || 0);
      if (idA < idB) return isAsc ? -1 : 1;
      if (idA > idB) return isAsc ? 1 : -1;
      return 0;
    });
  } else if (exportSortColumn === 'bio') {
    result.sort((a, b) => {
      const valA = (a.description || '').toLowerCase();
      const valB = (b.description || '').toLowerCase();
      return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  }
  
  filteredExportUsers = result;
  renderExportTable();
}

// Bind Export Click-to-Sort headers
function bindExportHeaderSort(headerId, column) {
  const th = document.getElementById(headerId);
  if (!th) return;
  th.addEventListener('click', () => {
    if (exportActive) return;
    
    if (exportSortColumn === column) {
      exportSortDirection = exportSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      exportSortColumn = column;
      exportSortDirection = 'asc';
    }
    
    exportPage = 0;
    filterAndSortExport();
  });
}

bindExportHeaderSort('eth-handle', 'username');
bindExportHeaderSort('eth-name', 'name');
bindExportHeaderSort('eth-bio', 'bio');
bindExportHeaderSort('eth-id', 'id');

// Export Pagination Listeners
btnExportPrev.addEventListener('click', () => {
  if (exportPage > 0) {
    exportPage--;
    renderExportTable();
  }
});

btnExportNext.addEventListener('click', () => {
  const totalPages = Math.ceil(filteredExportUsers.length / itemsPerPage);
  if (exportPage < totalPages - 1) {
    exportPage++;
    renderExportTable();
  }
});

// Export search filter input trigger
exportSearchInput.addEventListener('input', () => {
  exportPage = 0;
  filterAndSortExport();
});

async function fetchBlockedPage() {
  if (!exportActive) return;

  try {
    const url = `https://${sessionDomain}/i/api/1.1/blocks/list.json?cursor=${exportCursor}&skip_status=true&include_user_entities=false&count=200`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session'
      },
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 429) {
        log('[Export] Rate limited by Twitter. Waiting 60 seconds...', 'warning');
        setTimeout(fetchBlockedPage, 60000);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return;
    }

    const data = await response.json();
    const users = data.users || [];
    
    exportUsers.push(...users);
    exportCountEl.textContent = formatNum(exportUsers.length);
    log(`[Export] Fetched ${users.length} blocked users. Total: ${exportUsers.length}`, 'info');

    exportSearchContainer.style.display = 'block';
    filterAndSortExport();

    exportCursor = data.next_cursor_str || '0';

    if (exportCursor === '0' || users.length === 0) {
      log(`[Export] Completed! Found ${exportUsers.length} total blocked accounts.`, 'success');
      finishExport();
    } else {
      setTimeout(fetchBlockedPage, 500);
    }
  } catch (err) {
    log(`[Export] Error: ${err.message}`, 'error');
    stopExport();
  }
}

function startExport() {
  exportActive = true;
  exportUsers = [];
  filteredExportUsers = [];
  exportPage = 0;
  exportCursor = '-1';
  exportCountEl.textContent = '0';
  exportStatusEl.textContent = 'Fetching...';
  exportSearchInput.value = '';
  exportTableBody.innerHTML = '';
  exportSearchContainer.style.display = 'none';
  exportSortColumn = 'username';
  exportSortDirection = 'asc';
  
  btnStartExport.disabled = true;
  btnStopExport.disabled = false;
  btnDownloadTxt.disabled = true;
  btnDownloadCsv.disabled = true;
  
  log('[Export] Starting block list retrieval...', 'info');
  fetchBlockedPage();
}

// Check if progress label selector exists in HTML
const progressMetaEl = document.getElementById('progress-lbl') || document.getElementById('progress-meta');

function stopExport() {
  exportActive = false;
  exportStatusEl.textContent = 'Stopped';
  btnStartExport.disabled = false;
  btnStopExport.disabled = true;
  if (exportUsers.length > 0) {
    btnDownloadTxt.disabled = false;
    btnDownloadCsv.disabled = false;
  }
  log('[Export] Stopped by user.', 'warning');
}

function finishExport() {
  exportActive = false;
  exportStatusEl.textContent = 'Finished';
  btnStartExport.disabled = false;
  btnStopExport.disabled = true;
  btnDownloadTxt.disabled = false;
  btnDownloadCsv.disabled = false;
}

// Download handlers
btnDownloadTxt.addEventListener('click', () => {
  const usernames = exportUsers.map(u => u.screen_name || '').join('\n');
  const blob = new Blob([usernames], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `twitter_blocks_${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  log('[Export] Downloaded TXT file (Username Only).', 'success');
});

btnDownloadCsv.addEventListener('click', () => {
  const headers = ['id_str', 'screen_name', 'name', 'description'];
  const csvRows = [headers.join(',')];
  
  for (const user of exportUsers) {
    const values = headers.map(header => {
      const val = user[header] || '';
      return `"${val.toString().replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }
  
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `twitter_blocks_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  log('[Export] Downloaded CSV file (Full Profile).', 'success');
});

// --- Import & Parse Logic ---

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.style.borderColor = 'var(--accent-color)';
});

dropzone.addEventListener('dragleave', () => {
  dropzone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

function handleFile(file) {
  const reader = new FileReader();
  
  reader.onload = function(e) {
    const content = e.target.result;
    try {
      if (file.name.endsWith('.json')) {
        parseJson(content);
      } else if (file.name.endsWith('.csv')) {
        parseCsv(content);
      } else {
        parseTxt(content);
      }
    } catch (err) {
      log(`[Import] Failed to parse file: ${err.message}`, 'error');
    }
  };
  
  reader.readAsText(file);
  dropzonePrompt.innerHTML = `Loaded: <strong>${file.name}</strong>`;
}

function sanitizeUserIdentifier(val) {
  if (!val) return null;
  val = val.trim();
  if (val.startsWith('@')) {
    val = val.substring(1);
  }
  return val || null;
}

function initImportList(targets) {
  importUsers = targets.map((t, index) => ({
    originalIndex: index,
    target: t,
    selected: true,
    status: 'pending',
    name: '',
    handle: /^\d+$/.test(t) ? '' : t,
    bio: '',
    avatar: ''
  }));
  previewPage = 0;
  sortColumn = 'username';
  sortDirection = 'asc';
  
  btnImportDownloadTxt.disabled = true;
  btnImportDownloadCsv.disabled = true;
  
  sortImportUsers();
  updateImportStats();
  
  // Profile hydration is done dynamically on demand or parsed from file
  // hydrateProfileBios();
}

function parseJson(content) {
  const data = JSON.parse(content);
  let parsed = [];
  
  if (Array.isArray(data)) {
    parsed = data.map(item => {
      if (typeof item === 'string') return sanitizeUserIdentifier(item);
      if (typeof item === 'object' && item !== null) {
        return sanitizeUserIdentifier(item.screen_name || item.username || item.id_str || item.id);
      }
      return null;
    });
  } else if (typeof data === 'object' && data !== null) {
    for (const key in data) {
      if (Array.isArray(data[key])) {
        parsed = data[key].map(item => {
          if (typeof item === 'string') return sanitizeUserIdentifier(item);
          if (typeof item === 'object' && item !== null) {
            return sanitizeUserIdentifier(item.screen_name || item.username || item.id_str || item.id);
          }
          return null;
        });
        break;
      }
    }
  }
  
  initImportList(parsed.filter(Boolean));
}

// Global helper for user lookups
async function performLookup(paramName, values) {
  const paramVal = values.join(',');
  const url = `https://${sessionDomain}/i/api/1.1/users/lookup.json`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ [paramName]: paramVal }),
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`Lookup failed: HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (e) {
    log(`[System] User lookup error: ${e.message}`, 'warning');
    return [];
  }
}

// Fetch own handle for session header status via public HTML scraping fallback
async function getOwnHandle() {
  if (cachedOwnHandle) return cachedOwnHandle;
  try {
    const homeUrl = `https://${sessionDomain}/home`;
    log(`[Debug] Fetching home page HTML to resolve username: ${homeUrl}`, 'info');
    
    const response = await fetch(homeUrl, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    log(`[Debug] Home page HTML fetched (length ${html.length}). Searching for screen name...`, 'info');
    
    const match = html.match(/"screen_name"\s*:\s*"([a-zA-Z0-9_]{1,15})"/i) ||
                  html.match(/"screenName"\s*:\s*"([a-zA-Z0-9_]{1,15})"/i);
                  
    if (match && match[1]) {
      cachedOwnHandle = match[1];
      log(`[Debug] Successfully resolved screen_name from home page: @${cachedOwnHandle}`, 'success');
      return cachedOwnHandle;
    }
    
    throw new Error('screen_name not found in home page HTML source');
  } catch (e) {
    log(`[System] Credential check failed: ${e.message}`, 'warning');
    return null;
  }
}

function parseCsv(content) {
  const lines = content.split('\n');
  if (lines.length === 0) return;
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const usernameColIdx = headers.findIndex(h => h === 'screen_name' || h === 'username' || h === 'handle');
  const idColIdx = headers.findIndex(h => h === 'id_str' || h === 'id' || h === 'user_id');
  const nameColIdx = headers.findIndex(h => h === 'name' || h === 'display_name');
  const bioColIdx = headers.findIndex(h => h === 'description' || h === 'bio');
  const avatarColIdx = headers.findIndex(h => h === 'avatar' || h === 'profile_image_url' || h === 'profile_image_url_https');
  
  const hasMetaHeaders = (usernameColIdx !== -1 || idColIdx !== -1);
  const targetColIdx = usernameColIdx !== -1 ? usernameColIdx : (idColIdx !== -1 ? idColIdx : 0);
  const startIdx = hasMetaHeaders ? 1 : 0;
  
  const parsed = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV line keeping commas inside quotes safe
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cols.push(current.trim());
    
    const target = cols[targetColIdx];
    if (target) {
      const cleanTarget = sanitizeUserIdentifier(target);
      if (cleanTarget) {
        parsed.push({
          target: cleanTarget,
          name: nameColIdx !== -1 ? cols[nameColIdx] : '',
          handle: usernameColIdx !== -1 ? cols[usernameColIdx] : (/^\d+$/.test(cleanTarget) ? '' : cleanTarget),
          bio: bioColIdx !== -1 ? cols[bioColIdx] : '',
          avatar: avatarColIdx !== -1 ? cols[avatarColIdx] : '',
          id_str: idColIdx !== -1 ? cols[idColIdx] : (/^\d+$/.test(cleanTarget) ? cleanTarget : '')
        });
      }
    }
  }
  
  if (parsed.length > 0) {
    importUsers = parsed.map((item, index) => ({
      originalIndex: index,
      target: item.target,
      selected: true,
      status: 'pending',
      name: item.name,
      handle: item.handle,
      bio: item.bio,
      avatar: item.avatar,
      id_str: item.id_str
    }));
    
    previewPage = 0;
    sortColumn = 'username';
    sortDirection = 'asc';
    
    btnImportDownloadTxt.disabled = true;
    btnImportDownloadCsv.disabled = true;
    
    sortImportUsers();
    updateImportStats();
  }
}

function parseTxt(content) {
  const lines = content.split('\n');
  const parsed = [];
  
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    parsed.push(sanitizeUserIdentifier(line));
  }
  
  initImportList(parsed.filter(Boolean));
}

// Fetch followers or following directly of any user (Megablock)
async function fetchUserRelations() {
  const targetRaw = fetchUsernameInput.value.trim();
  const relation = fetchRelationSelect.value;
  if (!targetRaw) {
    log('[Fetch] Please enter a target username.', 'error');
    return;
  }
  
  const target = targetRaw.startsWith('@') ? targetRaw.substring(1) : targetRaw;
  
  btnFetchUsers.disabled = true;
  btnFetchUsers.textContent = 'Fetching...';
  log(`[Fetch] Fetching ${relation} of @${target}...`, 'info');
  
  let fetchedList = [];
  let cursor = '-1';
  let hasMore = true;
  let pageCount = 0;
  
  try {
    while (cursor !== '0' && hasMore && pageCount < 5) { // Cap at 1,000 users max
      const endpoint = relation === 'followers' ? 'followers/list.json' : 'friends/list.json';
      const url = `https://${sessionDomain}/i/api/1.1/${endpoint}?screen_name=${target}&cursor=${cursor}&count=200&skip_status=true&include_user_entities=false`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': BEARER_TOKEN,
          'x-csrf-token': csrfToken,
          'x-twitter-active-user': 'yes',
          'x-twitter-auth-type': 'OAuth2Session'
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          log('[Fetch] Rate limited during fetch. Loading what was retrieved so far...', 'warning');
          break;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const users = data.users || [];
      fetchedList.push(...users);
      
      log(`[Fetch] Retrieved ${users.length} accounts. Total: ${fetchedList.length}`, 'info');
      
      cursor = data.next_cursor_str || '0';
      if (users.length === 0 || cursor === '0') {
        break;
      }
      
      pageCount++;
      await new Promise(r => setTimeout(r, 500));
    }
    
    if (fetchedList.length === 0) {
      log('[Fetch] Found no accounts to import.', 'warning');
    } else {
      // Map complete profile details directly so no hydration is needed!
      importUsers = fetchedList.map((u, index) => ({
        originalIndex: index,
        target: u.screen_name,
        selected: true,
        status: 'pending',
        name: u.name,
        handle: u.screen_name,
        bio: u.description,
        avatar: u.profile_image_url_https,
        id_str: u.id_str
      }));
      
      previewPage = 0;
      sortColumn = 'username';
      sortDirection = 'asc';
      sortImportUsers();
      updateImportStats();
      
      log(`[Fetch] Successfully loaded ${importUsers.length} accounts from @${target}'s ${relation} list!`, 'success');
    }
  } catch (err) {
    log(`[Fetch] Error: ${err.message}`, 'error');
  } finally {
    btnFetchUsers.disabled = false;
    btnFetchUsers.textContent = 'Fetch and Load into Preview';
  }
}

btnFetchUsers.addEventListener('click', fetchUserRelations);

// Draw the visual preview arrow indicators on the header elements (Import Table)
function updateHeaderSortIndicators() {
  const headers = {
    'select': document.getElementById('th-select'),
    'username': document.getElementById('th-handle'),
    'name': document.getElementById('th-name'),
    'bio': document.getElementById('th-bio'),
    'userid': document.getElementById('th-id'),
    'status': document.getElementById('th-status')
  };
  
  for (const col in headers) {
    const th = headers[col];
    if (!th) continue;
    const indicator = th.querySelector('.sort-indicator');
    if (indicator) {
      if (col === sortColumn) {
        indicator.textContent = sortDirection === 'asc' ? ' ▲' : ' ▼';
      } else {
        indicator.textContent = '';
      }
    }
  }
}

function renderImportTable() {
  importTableBody.innerHTML = '';
  
  const start = previewPage * itemsPerPage;
  const end = Math.min(start + itemsPerPage, importUsers.length);
  const pageSlice = importUsers.slice(start, end);
  
  pageSlice.forEach((user) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-target', user.target);
    
    let statusClass = 'pending';
    if (user.status === 'success') statusClass = 'success';
    if (user.status === 'error') statusClass = 'error';
    if (user.status === 'skipped') statusClass = 'skipped';
    
    const userIdDisplay = /^\d+$/.test(user.target) ? user.target : (user.id_str || 'N/A');
    const handleDisplay = user.handle ? '@' + user.handle : ( /^\d+$/.test(user.target) ? 'ID: ' + user.target : '@' + user.target );
    const nameDisplay = user.name || 'N/A';
    const bioDisplay = user.bio || 'No bio parsed.';
    
    tr.innerHTML = `
      <td><input type="checkbox" class="import-select-cb" ${user.selected ? 'checked' : ''} ${blockActive ? 'disabled' : ''}></td>
      <td><span class="user-handle" style="color: var(--accent-color); font-weight: 600;">${handleDisplay}</span></td>
      <td>
        <div class="user-cell">
          <img class="user-avatar" src="${user.avatar || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'}" onerror="this.src='https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'">
          <span class="user-name">${nameDisplay}</span>
        </div>
      </td>
      <td><div class="bio-text" title="${bioDisplay}">${bioDisplay}</div></td>
      <td><code>${userIdDisplay}</code></td>
      <td><span class="status-label ${statusClass}">${user.status}</span></td>
    `;
    
    // Bind select checkbox
    tr.querySelector('.import-select-cb').addEventListener('change', (e) => {
      user.selected = e.target.checked;
      updateImportCountText();
    });
    
    importTableBody.appendChild(tr);
  });
  
  updateHeaderSortIndicators();
  updatePaginationControls();
}

function updateImportCountText() {
  const total = importUsers.length;
  const checked = importUsers.filter(u => u.selected).length;
  importCountEl.textContent = `${checked} Selected / ${total} Total`;
}

function updateImportStats() {
  updateImportCountText();
  log(`[Import] Loaded ${importUsers.length} accounts. Preview rendered below.`, 'success');
  previewContainer.style.display = 'block';
  dropzone.classList.add('has-file');
  btnStartBlock.disabled = importUsers.length === 0;
  selectAllImports.checked = true;
  blockIndex = 0;
  
  btnImportDownloadTxt.disabled = importUsers.length === 0;
  btnImportDownloadCsv.disabled = importUsers.length === 0;
  
  renderImportTable();
  updateProgressBar();
}

// Select/Deselect All Checkbox
selectAllImports.addEventListener('change', (e) => {
  const isChecked = e.target.checked;
  importUsers.forEach(u => u.selected = isChecked);
  document.querySelectorAll('.import-select-cb').forEach(cb => cb.checked = isChecked);
  updateImportCountText();
});

// Profile details lookup hydration
async function hydrateProfileBios() {
  if (importUsers.length === 0) return;
  
  log('[Import] Hydrating profile details in batches of 100...', 'info');
  
  const idTargets = [];
  const handleTargets = [];
  
  // Filter out users that ALREADY have names/handles fetched (e.g. megablocked ones)
  const hydrationQueue = importUsers.filter(u => !u.name);
  if (hydrationQueue.length === 0) {
    log('[Import] All loaded profiles are already hydrated.', 'success');
    return;
  }
  
  hydrationQueue.forEach((u) => {
    const isNum = /^\d+$/.test(u.target);
    if (isNum) {
      idTargets.push({ userObj: u, val: u.target });
    } else {
      handleTargets.push({ userObj: u, val: u.target });
    }
  });
  
  const batchSize = 100;
  
  
  
  // Batch processing handles
  for (let i = 0; i < handleTargets.length; i += batchSize) {
    const batch = handleTargets.slice(i, i + batchSize);
    const names = batch.map(b => b.val);
    const profiles = await performLookup('screen_name', names);
    
    profiles.forEach(p => {
      const match = batch.find(b => b.val.toLowerCase() === p.screen_name.toLowerCase());
      if (match) {
        match.userObj.name = p.name;
        match.userObj.handle = p.screen_name;
        match.userObj.bio = p.description;
        match.userObj.avatar = p.profile_image_url_https;
        match.userObj.id_str = p.id_str;
      }
    });
  }
  
  // Batch processing IDs
  for (let i = 0; i < idTargets.length; i += batchSize) {
    const batch = idTargets.slice(i, i + batchSize);
    const ids = batch.map(b => b.val);
    const profiles = await performLookup('user_id', ids);
    
    profiles.forEach(p => {
      const match = batch.find(b => b.val === p.id_str);
      if (match) {
        match.userObj.name = p.name;
        match.userObj.handle = p.screen_name;
        match.userObj.bio = p.description;
        match.userObj.avatar = p.profile_image_url_https;
        match.userObj.id_str = p.id_str;
      }
    });
  }
  
  log('[Import] Finished profile hydration.', 'success');
  sortImportUsers();
  renderImportTable();
}

// --- Pagination Controls Logic (Import Table) ---
btnPrevPage.addEventListener('click', () => {
  if (previewPage > 0) {
    previewPage--;
    renderImportTable();
  }
});

btnNextPage.addEventListener('click', () => {
  const totalPages = Math.ceil(importUsers.length / itemsPerPage);
  if (previewPage < totalPages - 1) {
    previewPage++;
    renderImportTable();
  }
});

function updatePaginationControls() {
  const totalPages = Math.ceil(importUsers.length / itemsPerPage) || 1;
  pageInfo.textContent = `Page ${previewPage + 1} of ${totalPages}`;
  btnPrevPage.disabled = previewPage === 0;
  btnNextPage.disabled = previewPage >= totalPages - 1;
}

// --- Table Sorting Logic (Import Table) ---

function sortImportUsers() {
  const isAsc = sortDirection === 'asc';
  
  if (sortColumn === 'select') {
    importUsers.sort((a, b) => {
      const valA = a.selected ? 1 : 0;
      const valB = b.selected ? 1 : 0;
      return isAsc ? (valA - valB) : (valB - valA);
    });
  } else if (sortColumn === 'username') {
    importUsers.sort((a, b) => {
      const valA = (a.handle || a.target).toLowerCase();
      const valB = (b.handle || b.target).toLowerCase();
      return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  } else if (sortColumn === 'name') {
    importUsers.sort((a, b) => {
      const valA = (a.name || '').toLowerCase();
      const valB = (b.name || '').toLowerCase();
      return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  } else if (sortColumn === 'userid') {
    importUsers.sort((a, b) => {
      const isNumA = /^\d+$/.test(a.target);
      const isNumB = /^\d+$/.test(b.target);
      
      const idA = isNumA ? BigInt(a.target) : (a.id_str ? BigInt(a.id_str) : 0n);
      const idB = isNumB ? BigInt(b.target) : (b.id_str ? BigInt(b.id_str) : 0n);
      
      if (idA < idB) return isAsc ? -1 : 1;
      if (idA > idB) return isAsc ? 1 : -1;
      return 0;
    });
  } else if (sortColumn === 'bio') {
    importUsers.sort((a, b) => {
      const valA = (a.bio || '').toLowerCase();
      const valB = (b.bio || '').toLowerCase();
      return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  } else if (sortColumn === 'status') {
    const weights = { 'error': 0, 'success': 1, 'skipped': 2, 'pending': 3 };
    importUsers.sort((a, b) => {
      const valA = weights[a.status];
      const valB = weights[b.status];
      return isAsc ? (valA - valB) : (valB - valA);
    });
  }
}

// Click listener binders for headers
function bindHeaderSort(headerId, column) {
  const th = document.getElementById(headerId);
  if (!th) return;
  th.addEventListener('click', () => {
    if (blockActive) return;
    
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
    
    sortImportUsers();
    previewPage = 0;
    renderImportTable();
  });
}

bindHeaderSort('th-select', 'select');
bindHeaderSort('th-handle', 'username');
bindHeaderSort('th-name', 'name');
bindHeaderSort('th-id', 'userid');
bindHeaderSort('th-bio', 'bio');
bindHeaderSort('th-status', 'status');

// --- Mass Execution Logic ---

async function fetchOwnFollowing() {
  log('[System] Initializing safety list: Caching your following list...', 'info');
  followingIdsSet.clear();
  followingNamesSet.clear();
  try {
    if (!cachedOwnId) return;
    
    let cursor = '-1';
    while (cursor !== '0') {
      const friendsUrl = `https://${sessionDomain}/i/api/1.1/friends/list.json?user_id=${cachedOwnId}&cursor=${cursor}&count=200&skip_status=true&include_user_entities=false`;
      const res = await fetch(friendsUrl, {
        headers: {
          'Authorization': BEARER_TOKEN,
          'x-csrf-token': csrfToken,
          'x-twitter-active-user': 'yes',
          'x-twitter-auth-type': 'OAuth2Session'
        },
        credentials: 'include'
      });
      if (!res.ok) break;
      const data = await res.json();
      const users = data.users || [];
      users.forEach(u => {
        if (u.id_str) followingIdsSet.add(u.id_str);
        if (u.screen_name) followingNamesSet.add(u.screen_name.toLowerCase());
      });
      cursor = data.next_cursor_str || '0';
      if (users.length === 0) break;
    }
    log(`[System] Cached ${followingNamesSet.size} following accounts.`, 'success');
    fetchedFollowingForSkipping = true;
  } catch (err) {
    log(`[System] Could not cache your following list: ${err.message}`, 'warning');
  }
}

async function fetchOwnFollowers() {
  log('[System] Initializing safety list: Caching your followers list...', 'info');
  followersIdsSet.clear();
  followersNamesSet.clear();
  try {
    if (!cachedOwnId) return;
    
    let cursor = '-1';
    let pagesFetched = 0;
    while (cursor !== '0' && pagesFetched < 5) {
      const followersUrl = `https://${sessionDomain}/i/api/1.1/followers/list.json?user_id=${cachedOwnId}&cursor=${cursor}&count=200&skip_status=true&include_user_entities=false`;
      const res = await fetch(followersUrl, {
        headers: {
          'Authorization': BEARER_TOKEN,
          'x-csrf-token': csrfToken,
          'x-twitter-active-user': 'yes',
          'x-twitter-auth-type': 'OAuth2Session'
        },
        credentials: 'include'
      });
      if (!res.ok) break;
      const data = await res.json();
      const users = data.users || [];
      users.forEach(u => {
        if (u.id_str) followersIdsSet.add(u.id_str);
        if (u.screen_name) followersNamesSet.add(u.screen_name.toLowerCase());
      });
      cursor = data.next_cursor_str || '0';
      pagesFetched++;
      if (users.length === 0) break;
    }
    log(`[System] Cached ${followersNamesSet.size} followers.`, 'success');
    fetchedFollowersForSkipping = true;
  } catch (err) {
    log(`[System] Could not cache your followers list: ${err.message}`, 'warning');
  }
}

async function fetchCurrentBlocksForSkipping() {
  log('[System] Initializing block list cache to skip already blocked accounts...', 'info');
  blockedIdsSet.clear();
  blockedNamesSet.clear();

  if (exportUsers.length > 0) {
    for (const u of exportUsers) {
      if (u.id_str) blockedIdsSet.add(u.id_str);
      if (u.screen_name) blockedNamesSet.add(u.screen_name.toLowerCase());
    }
    log(`[System] Reused ${blockedIdsSet.size} already blocked accounts from export data.`, 'success');
    fetchedBlockedListForSkipping = true;
    return;
  }

  try {
    const idsUrl = `https://${sessionDomain}/i/api/1.1/blocks/ids.json?stringify_ids=true`;
    const idsResponse = await fetch(idsUrl, {
      headers: {
        'Authorization': BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session'
      },
      credentials: 'include'
    });

    if (idsResponse.ok) {
      const data = await idsResponse.json();
      const ids = data.ids || [];
      for (const id of ids) {
        blockedIdsSet.add(id);
      }
      log(`[System] Cached ${blockedIdsSet.size} blocked IDs.`, 'info');
    }

    let cursor = '-1';
    let pagesFetched = 0;
    while (cursor !== '0' && pagesFetched < 3) {
      const listUrl = `https://${sessionDomain}/i/api/1.1/blocks/list.json?cursor=${cursor}&skip_status=true&include_user_entities=false&count=200`;
      const listResponse = await fetch(listUrl, {
        headers: {
          'Authorization': BEARER_TOKEN,
          'x-csrf-token': csrfToken,
          'x-twitter-active-user': 'yes',
          'x-twitter-auth-type': 'OAuth2Session'
        },
        credentials: 'include'
      });

      if (!listResponse.ok) break;

      const data = await listResponse.json();
      const users = data.users || [];
      for (const u of users) {
        if (u.id_str) blockedIdsSet.add(u.id_str);
        if (u.screen_name) blockedNamesSet.add(u.screen_name.toLowerCase());
      }
      cursor = data.next_cursor_str || '0';
      pagesFetched++;
      if (users.length === 0) break;
    }
    log(`[System] Cache populated. Total cached: ${blockedIdsSet.size} IDs, ${blockedNamesSet.size} handles.`, 'success');
    fetchedBlockedListForSkipping = true;
  } catch (err) {
    log(`[System] Error caching blocks: ${err.message}`, 'warning');
  }
}

async function fetchCurrentMutesForSkipping() {
  log('[System] Initializing mute list cache to skip already muted accounts...', 'info');
  mutedIdsSet.clear();
  mutedNamesSet.clear();
  try {
    const idsUrl = `https://${sessionDomain}/i/api/1.1/mutes/users/ids.json?stringify_ids=true`;
    const idsResponse = await fetch(idsUrl, {
      headers: {
        'Authorization': BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session'
      },
      credentials: 'include'
    });

    if (idsResponse.ok) {
      const data = await idsResponse.json();
      const ids = data.ids || [];
      for (const id of ids) {
        mutedIdsSet.add(id);
      }
      log(`[System] Cached ${mutedIdsSet.size} muted IDs.`, 'info');
    }
    
    const listUrl = `https://${sessionDomain}/i/api/1.1/mutes/users/list.json?count=200`;
    const listResponse = await fetch(listUrl, {
      headers: {
        'Authorization': BEARER_TOKEN,
        'x-csrf-token': csrfToken,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session'
      },
      credentials: 'include'
    });
    if (listResponse.ok) {
      const data = await listResponse.json();
      const users = data.users || [];
      for (const u of users) {
        if (u.id_str) mutedIdsSet.add(u.id_str);
        if (u.screen_name) mutedNamesSet.add(u.screen_name.toLowerCase());
      }
    }
    fetchedMutedListForSkipping = true;
  } catch (err) {
    log(`[System] Error caching mutes: ${err.message}`, 'warning');
  }
}

async function sendActionRequest(target, action) {
  const isNumeric = /^\d+$/.test(target);
  const bodyData = isNumeric ? { user_id: target } : { screen_name: target };
  
  let endpoint = 'blocks/create.json';
  if (action === 'unblock') endpoint = 'blocks/destroy.json';
  if (action === 'mute') endpoint = 'mutes/users/create.json';
  if (action === 'unmute') endpoint = 'mutes/users/destroy.json';
  if (action === 'follow') endpoint = 'friendships/create.json';
  if (action === 'unfollow') endpoint = 'friendships/destroy.json';
  
  const response = await fetch(`https://${sessionDomain}/i/api/1.1/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': BEARER_TOKEN,
      'x-csrf-token': csrfToken,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(bodyData),
    credentials: 'include'
  });

  if (!response.ok) {
    if (response.status === 429) {
      const resetHeader = response.headers.get('x-rate-limit-reset');
      throw { message: 'Rate Limited', resetTime: resetHeader ? parseInt(resetHeader) * 1000 : null };
    }
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData.errors?.[0]?.message || `HTTP ${response.status}`;
    throw new Error(errMsg);
  }
  
  return await response.json();
}

function startCooldownCountdown(waitMs) {
  rateLimitCountdown.style.display = 'flex';
  const targetTime = Date.now() + waitMs;
  
  function updateTimer() {
    const diff = targetTime - Date.now();
    if (diff <= 0) {
      clearInterval(cooldownIntervalId);
      rateLimitCountdown.style.display = 'none';
      return;
    }
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    countdownTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  updateTimer();
  cooldownIntervalId = setInterval(updateTimer, 1000);
}

let activeRunStats = {
  actionType: '',
  startTime: 0,
  total: 0,
  success: 0,
  skipped: 0,
  failed: 0,
  errors: []
};

async function processNextAction() {
  if (!blockActive) return;
  
  if (blockIndex >= importUsers.length) {
    log(`[Execution] Completed! All ${importUsers.length} accounts processed.`, 'success');
    finishMassBlock();
    return;
  }
  
  const user = importUsers[blockIndex];
  const action = actionSelect.value;
  updateProgressBar();
  
  if (!user.selected) {
    user.status = 'skipped';
    activeRunStats.skipped++;
    log(`[Skip] ${user.target} is deselected. Skipping.`, 'info');
    blockIndex++;
    updateImportedRow(user.target, 'skipped');
    blockTimeoutId = setTimeout(processNextAction, 50);
    return;
  }

  const isNumeric = /^\d+$/.test(user.target);

  // Safety Whitelist Options Checks
  const isSelf = isNumeric ? (user.target === cachedOwnId) : (user.target.toLowerCase() === cachedOwnHandle?.toLowerCase());
  
  if (isSelf) {
    user.status = 'skipped';
    activeRunStats.skipped++;
    log(`[Safety Skip] ${user.target} is your own account. Skipping.`, 'success');
    blockIndex++;
    updateImportedRow(user.target, 'skipped');
    blockTimeoutId = setTimeout(processNextAction, 50);
    return;
  }

  if (chkSkipFollowing.checked) {
    const isFollowing = isNumeric
      ? followingIdsSet.has(user.target)
      : followingNamesSet.has(user.target.toLowerCase());
      
    if (isFollowing) {
      user.status = 'skipped';
      activeRunStats.skipped++;
      log(`[Safety Skip] ${user.target} is followed by you. Skipping.`, 'success');
      blockIndex++;
      updateImportedRow(user.target, 'skipped');
      blockTimeoutId = setTimeout(processNextAction, 50);
      return;
    }
  }

  if (chkSkipFollowers.checked) {
    const isFollower = isNumeric
      ? followersIdsSet.has(user.target)
      : followersNamesSet.has(user.target.toLowerCase());
      
    if (isFollower) {
      user.status = 'skipped';
      activeRunStats.skipped++;
      log(`[Safety Skip] ${user.target} is a follower of yours. Skipping.`, 'success');
      blockIndex++;
      updateImportedRow(user.target, 'skipped');
      blockTimeoutId = setTimeout(processNextAction, 50);
      return;
    }
  }

  // Action-specific dynamic skipping cache checks
  
  // 1. Block skip checks
  const isAlreadyBlocked = isNumeric 
    ? blockedIdsSet.has(user.target) 
    : blockedNamesSet.has(user.target.toLowerCase());

  if (action === 'block' && isAlreadyBlocked) {
    user.status = 'skipped';
    activeRunStats.skipped++;
    log(`[Skip] ${user.target} is already blocked. Skipping.`, 'info');
    blockIndex++;
    updateImportedRow(user.target, 'skipped');
    blockTimeoutId = setTimeout(processNextAction, 50);
    return;
  }
  
  if (action === 'unblock' && !isAlreadyBlocked) {
    user.status = 'skipped';
    activeRunStats.skipped++;
    log(`[Skip] ${user.target} is not blocked by you. Skipping.`, 'info');
    blockIndex++;
    updateImportedRow(user.target, 'skipped');
    blockTimeoutId = setTimeout(processNextAction, 50);
    return;
  }

  // 2. Mute skip checks
  const isAlreadyMuted = isNumeric
    ? mutedIdsSet.has(user.target)
    : mutedNamesSet.has(user.target.toLowerCase());

  if (action === 'mute' && isAlreadyMuted) {
    user.status = 'skipped';
    activeRunStats.skipped++;
    log(`[Skip] ${user.target} is already muted. Skipping.`, 'info');
    blockIndex++;
    updateImportedRow(user.target, 'skipped');
    blockTimeoutId = setTimeout(processNextAction, 50);
    return;
  }
  
  if (action === 'unmute' && !isAlreadyMuted) {
    user.status = 'skipped';
    activeRunStats.skipped++;
    log(`[Skip] ${user.target} is not muted by you. Skipping.`, 'info');
    blockIndex++;
    updateImportedRow(user.target, 'skipped');
    blockTimeoutId = setTimeout(processNextAction, 50);
    return;
  }

  // 3. Follow skip checks
  const isAlreadyFollowing = isNumeric
    ? followingIdsSet.has(user.target)
    : followingNamesSet.has(user.target.toLowerCase());

  if (action === 'follow' && isAlreadyFollowing) {
    user.status = 'skipped';
    activeRunStats.skipped++;
    log(`[Skip] ${user.target} is already followed. Skipping.`, 'info');
    blockIndex++;
    updateImportedRow(user.target, 'skipped');
    blockTimeoutId = setTimeout(processNextAction, 50);
    return;
  }
  
  if (action === 'unfollow' && !isAlreadyFollowing) {
    user.status = 'skipped';
    activeRunStats.skipped++;
    log(`[Skip] ${user.target} is not followed by you. Skipping.`, 'info');
    blockIndex++;
    updateImportedRow(user.target, 'skipped');
    blockTimeoutId = setTimeout(processNextAction, 50);
    return;
  }

  try {
    await sendActionRequest(user.target, action);
    user.status = 'success';
    activeRunStats.success++;
    log(`[Success] Action [${action}] on ${user.target} (${blockIndex + 1}/${importUsers.length})`, 'success');
    
    // Dynamic Cache Update on success
    if (action === 'block') {
      if (isNumeric) {
        blockedIdsSet.add(user.target);
        followingIdsSet.delete(user.target);
        followersIdsSet.delete(user.target);
      } else {
        blockedNamesSet.add(user.target.toLowerCase());
        followingNamesSet.delete(user.target.toLowerCase());
        followersNamesSet.delete(user.target.toLowerCase());
      }
    } else if (action === 'unblock') {
      if (isNumeric) blockedIdsSet.delete(user.target);
      else blockedNamesSet.delete(user.target.toLowerCase());
    } else if (action === 'mute') {
      if (isNumeric) mutedIdsSet.add(user.target);
      else mutedNamesSet.add(user.target.toLowerCase());
    } else if (action === 'unmute') {
      if (isNumeric) mutedIdsSet.delete(user.target);
      else mutedNamesSet.delete(user.target.toLowerCase());
    } else if (action === 'follow') {
      if (isNumeric) followingIdsSet.add(user.target);
      else followingNamesSet.add(user.target.toLowerCase());
    } else if (action === 'unfollow') {
      if (isNumeric) followingIdsSet.delete(user.target);
      else followingNamesSet.delete(user.target.toLowerCase());
    }
    
    blockIndex++;
    updateImportedRow(user.target, 'success');
    blockTimeoutId = setTimeout(processNextAction, blockDelay * 1000);
  } catch (err) {
    if (err.message === 'Rate Limited') {
      let waitMs = 900000; // 15 mins default
      if (err.resetTime) {
        waitMs = Math.max(5000, err.resetTime - Date.now() + 5000);
      }
      const waitMins = Math.ceil(waitMs / 60000);
      log(`[Rate Limit] Action [${action}] rate-limited. Waiting ${waitMins} minutes before retrying...`, 'warning');
      
      startCooldownCountdown(waitMs);
      blockTimeoutId = setTimeout(processNextAction, waitMs);
    } else {
      user.status = 'error';
      activeRunStats.failed++;
      activeRunStats.errors.push(`${user.target}: ${err.message}`);
      
      log(`[Error] Action [${action}] failed for ${user.target}: ${err.message}`, 'error');
      blockIndex++;
      updateImportedRow(user.target, 'error');
      blockTimeoutId = setTimeout(processNextAction, blockDelay * 1000);
    }
  }
}

function updateImportedRow(target, status) {
  const row = importTableBody.querySelector(`tr[data-target="${target}"]`);
  if (row) {
    const statusLabel = row.querySelector('.status-label');
    if (statusLabel) {
      statusLabel.className = `status-label ${status}`;
      statusLabel.textContent = status;
    }
  }
}

function updateProgressBar() {
  if (importUsers.length === 0) return;
  const percent = Math.round((blockIndex / importUsers.length) * 100);
  progressPercent.textContent = `${percent}%`;
  progressBarFill.style.width = `${percent}%`;
  const act = actionSelect.value;
  if (progressMetaEl) {
    progressMetaEl.textContent = `Executing [${act}] on user ${blockIndex + 1} of ${importUsers.length}...`;
  }
}

async function startMassBlock() {
  if (!csrfToken) {
    log('[Execution] Cannot start. No active session.', 'error');
    return;
  }
  
  btnStartBlock.disabled = true;
  btnStopBlock.disabled = false;
  blockDelayInput.disabled = true;
  fileInput.disabled = true;
  actionSelect.disabled = true;
  btnImportDownloadTxt.disabled = true;
  btnImportDownloadCsv.disabled = true;
  selectAllImports.disabled = true;
  progressContainer.style.display = 'flex';
  
  blockActive = true;
  blockDelay = parseFloat(blockDelayInput.value) || 1.5;

  const action = actionSelect.value;
  
  if (blockIndex === 0) {
    activeRunStats = {
      actionType: action,
      startTime: Date.now(),
      total: importUsers.filter(u => u.selected).length,
      success: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };
    
    importUsers.forEach(u => {
      if (u.selected) u.status = 'pending';
    });
    renderImportTable();
  }

  // Cache following if:
  // - skipFollowing is checked
  // - action is follow or unfollow
  if ((chkSkipFollowing.checked || action === 'follow' || action === 'unfollow') && !fetchedFollowingForSkipping) {
    if (progressMetaEl) progressMetaEl.textContent = 'Caching accounts you follow...';
    await fetchOwnFollowing();
  }

  // Cache followers if:
  // - skipFollowers is checked
  if (chkSkipFollowers.checked && !fetchedFollowersForSkipping) {
    if (progressMetaEl) progressMetaEl.textContent = 'Caching accounts that follow you...';
    await fetchOwnFollowers();
  }

  // Cache blocked users if:
  // - action is block or unblock
  if ((action === 'block' || action === 'unblock') && !fetchedBlockedListForSkipping) {
    if (progressMetaEl) progressMetaEl.textContent = 'Caching already blocked users...';
    await fetchCurrentBlocksForSkipping();
  }

  // Cache muted users if:
  // - action is mute or unmute
  if ((action === 'mute' || action === 'unmute') && !fetchedMutedListForSkipping) {
    if (progressMetaEl) progressMetaEl.textContent = 'Caching already muted users...';
    await fetchCurrentMutesForSkipping();
  }
  
  log(`[Execution] Starting bulk action [${action}] with delay of ${blockDelay}s...`, 'info');
  processNextAction();
}

function pauseMassBlock() {
  blockActive = false;
  if (blockTimeoutId) clearTimeout(blockTimeoutId);
  if (cooldownIntervalId) clearInterval(cooldownIntervalId);
  rateLimitCountdown.style.display = 'none';
  
  btnStartBlock.disabled = false;
  btnStartBlock.textContent = 'Resume';
  btnStopBlock.disabled = true;
  blockDelayInput.disabled = false;
  actionSelect.disabled = false;
  btnImportDownloadTxt.disabled = importUsers.length === 0;
  btnImportDownloadCsv.disabled = importUsers.length === 0;
  selectAllImports.disabled = false;
  
  log('[Execution] Action execution paused by user.', 'warning');
}

function finishMassBlock() {
  blockActive = false;
  blockIndex = 0;
  btnStartBlock.disabled = false;
  btnStartBlock.textContent = 'Start';
  btnStopBlock.disabled = true;
  blockDelayInput.disabled = false;
  fileInput.disabled = false;
  actionSelect.disabled = false;
  btnImportDownloadTxt.disabled = importUsers.length === 0;
  btnImportDownloadCsv.disabled = importUsers.length === 0;
  selectAllImports.disabled = false;
  progressContainer.style.display = 'none';
}

// --- Event Listeners ---

btnStartExport.addEventListener('click', startExport);
btnStopExport.addEventListener('click', stopExport);

btnStartBlock.addEventListener('click', startMassBlock);
btnStopBlock.addEventListener('click', pauseMassBlock);

actionSelect.addEventListener('change', () => {
  const act = actionSelect.value;
  const warningRow = document.getElementById('action-warning-row');
  if (warningRow) {
    if (act === 'follow' || act === 'unfollow') {
      warningRow.style.display = 'block';
      blockDelayInput.value = '10';
    } else {
      warningRow.style.display = 'none';
      blockDelayInput.value = '1.5';
    }
  }
});

// Import Download click handlers
btnImportDownloadTxt.addEventListener('click', () => {
  if (importUsers.length === 0) return;
  const usernames = importUsers.map(u => u.handle || u.target).join('\n');
  const blob = new Blob([usernames], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `imported_list_${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  log('[Import] Downloaded active list as TXT.', 'success');
});

btnImportDownloadCsv.addEventListener('click', () => {
  if (importUsers.length === 0) return;
  const headers = ['id_str', 'screen_name', 'name', 'description'];
  const csvRows = [headers.join(',')];
  
  for (const u of importUsers) {
    const values = [
      u.id_str || '',
      u.handle || '',
      u.name || '',
      u.bio || ''
    ].map(val => `"${val.toString().replace(/"/g, '""')}"`);
    csvRows.push(values.join(','));
  }
  
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `imported_list_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  log('[Import] Downloaded active list as CSV.', 'success');
});

// Privacy Modal Listeners
const privacyModal = document.getElementById('privacy-modal');
const btnShowPrivacy = document.getElementById('btn-show-privacy');
const btnClosePrivacy = document.getElementById('btn-close-privacy');

if (btnShowPrivacy && privacyModal) {
  btnShowPrivacy.addEventListener('click', () => {
    privacyModal.style.display = 'flex';
  });
}
if (btnClosePrivacy && privacyModal) {
  btnClosePrivacy.addEventListener('click', () => {
    privacyModal.style.display = 'none';
  });
}

// Initialize
initSession();
