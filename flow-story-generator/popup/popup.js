/**
 * Flow Story Generator - Popup Script
 * Handles UI interactions and communication with content script
 */

// State management
const state = {
  isRunning: false,
  isPaused: false,
  characterImage: null,
  characterImageData: null,
  prompts: [],
  currentIndex: 0,
  generatedImages: [],
  tabId: null
};

// DOM Elements
const elements = {
  // Status
  statusText: document.getElementById('status-text'),
  connectionStatus: document.getElementById('connection-status'),

  // Character upload
  characterUploadArea: document.getElementById('character-upload-area'),
  characterImage: document.getElementById('character-image'),
  uploadPreview: document.getElementById('upload-preview'),
  characterPreview: document.getElementById('character-preview'),
  removeCharacter: document.getElementById('remove-character'),

  // Prompts
  promptsInput: document.getElementById('prompts-input'),
  promptCount: document.getElementById('prompt-count'),

  // Progress
  progressSection: document.getElementById('progress-section'),
  progressFill: document.getElementById('progress-fill'),
  progressCurrent: document.getElementById('progress-current'),
  progressTotal: document.getElementById('progress-total'),
  currentPrompt: document.getElementById('current-prompt'),

  // Buttons
  btnStart: document.getElementById('btn-start'),
  btnPause: document.getElementById('btn-pause'),
  btnResume: document.getElementById('btn-resume'),
  btnStop: document.getElementById('btn-stop'),
  btnDownload: document.getElementById('btn-download'),
  btnClearLog: document.getElementById('btn-clear-log'),

  // Download options
  downloadOptions: document.getElementById('download-options'),
  filenamePrefix: document.getElementById('filename-prefix'),

  // Log
  logContainer: document.getElementById('log-container'),
  btnScanPage: document.getElementById('btn-scan-page'),

  // Settings
  settingTimeout: document.getElementById('setting-timeout'),
  settingDelay: document.getElementById('setting-delay'),
  settingRetries: document.getElementById('setting-retries'),
  settingDownloadDelay: document.getElementById('setting-download-delay')
};

/**
 * Initialize the popup
 */
async function init() {
  log('Initializing extension...', 'info');

  // Load saved state
  await loadState();

  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    state.tabId = tabs[0].id;

    // Check if we're on the correct page
    if (tabs[0].url && tabs[0].url.includes('labs.google/fx/tools/flow')) {
      updateConnectionStatus('connected');
      log('Connected to Google Flow page', 'success');
    } else {
      updateConnectionStatus('disconnected');
      log('Please navigate to Google Flow (labs.google/fx/tools/flow)', 'warning');
    }
  }

  // Setup event listeners
  setupEventListeners();

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener(handleMessage);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Character image upload
  elements.characterUploadArea.addEventListener('click', () => {
    elements.characterImage.click();
  });

  elements.characterUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.characterUploadArea.classList.add('drag-over');
  });

  elements.characterUploadArea.addEventListener('dragleave', () => {
    elements.characterUploadArea.classList.remove('drag-over');
  });

  elements.characterUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.characterUploadArea.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleCharacterUpload(files[0]);
    }
  });

  elements.characterImage.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleCharacterUpload(e.target.files[0]);
    }
  });

  elements.removeCharacter.addEventListener('click', (e) => {
    e.stopPropagation();
    removeCharacterImage();
  });

  // Prompts input
  elements.promptsInput.addEventListener('input', updatePromptCount);

  // Control buttons
  elements.btnStart.addEventListener('click', startGeneration);
  elements.btnPause.addEventListener('click', pauseGeneration);
  elements.btnResume.addEventListener('click', resumeGeneration);
  elements.btnStop.addEventListener('click', stopGeneration);
  elements.btnDownload.addEventListener('click', downloadAllImages);
  elements.btnClearLog.addEventListener('click', clearLog);
  elements.btnScanPage.addEventListener('click', scanPage);

  // Settings changes
  elements.settingTimeout.addEventListener('change', saveState);
  elements.settingDelay.addEventListener('change', saveState);
  elements.settingRetries.addEventListener('change', saveState);
  elements.settingDownloadDelay.addEventListener('change', saveState);
}

/**
 * Handle character image upload
 */
function handleCharacterUpload(file) {
  if (!file.type.startsWith('image/')) {
    log('Please upload a valid image file', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    state.characterImage = file;
    state.characterImageData = e.target.result;

    // Show preview
    elements.uploadPreview.hidden = true;
    elements.characterPreview.src = e.target.result;
    elements.characterPreview.hidden = false;
    elements.removeCharacter.hidden = false;

    log(`Character image loaded: ${file.name}`, 'success');
    saveState();
  };
  reader.readAsDataURL(file);
}

/**
 * Remove character image
 */
function removeCharacterImage() {
  state.characterImage = null;
  state.characterImageData = null;

  elements.uploadPreview.hidden = false;
  elements.characterPreview.hidden = true;
  elements.characterPreview.src = '';
  elements.removeCharacter.hidden = true;
  elements.characterImage.value = '';

  log('Character image removed', 'info');
  saveState();
}

/**
 * Update prompt count display
 */
function updatePromptCount() {
  const text = elements.promptsInput.value.trim();
  const prompts = text ? text.split('\n').filter(p => p.trim()) : [];
  elements.promptCount.textContent = prompts.length;
  state.prompts = prompts;
  saveState();
}

/**
 * Start the generation process
 */
async function startGeneration() {
  // Validate inputs
  if (!state.characterImageData) {
    log('Please upload a character image first', 'error');
    return;
  }

  const prompts = elements.promptsInput.value.trim().split('\n').filter(p => p.trim());
  if (prompts.length === 0) {
    log('Please enter at least one prompt', 'error');
    return;
  }

  state.prompts = prompts;
  state.currentIndex = 0;
  state.isRunning = true;
  state.isPaused = false;
  state.generatedImages = [];

  // Update UI
  updateControlButtons();
  elements.progressSection.hidden = false;
  elements.progressTotal.textContent = prompts.length;
  updateProgress(0);

  log(`Starting generation of ${prompts.length} images...`, 'info');
  updateConnectionStatus('processing');

  // Send start command to content script
  await sendToContentScript({
    action: 'START_GENERATION',
    data: {
      prompts: prompts,
      characterImageData: state.characterImageData,
      settings: getSettings()
    }
  });

  saveState();
}

/**
 * Pause the generation process
 */
async function pauseGeneration() {
  state.isPaused = true;
  updateControlButtons();
  log('Generation paused', 'warning');

  await sendToContentScript({ action: 'PAUSE_GENERATION' });
  saveState();
}

/**
 * Resume the generation process
 */
async function resumeGeneration() {
  state.isPaused = false;
  updateControlButtons();
  log('Generation resumed', 'info');
  updateConnectionStatus('processing');

  await sendToContentScript({ action: 'RESUME_GENERATION' });
  saveState();
}

/**
 * Stop the generation process
 */
async function stopGeneration() {
  state.isRunning = false;
  state.isPaused = false;
  updateControlButtons();
  updateConnectionStatus('connected');
  log('Generation stopped', 'warning');

  await sendToContentScript({ action: 'STOP_GENERATION' });
  saveState();
}

/**
 * Download all generated images
 */
async function downloadAllImages() {
  log('Fetching images from page...', 'info');

  const response = await sendToContentScript({ action: 'GET_ALL_IMAGES' });

  if (!response || !response.images || response.images.length === 0) {
    log('No images found to download', 'warning');
    return;
  }

  const images = response.images;
  const prefix = elements.filenamePrefix.value || 'story';
  const delay = parseInt(elements.settingDownloadDelay.value) || 500;

  log(`Starting download of ${images.length} images...`, 'info');

  // Send download request to background script
  chrome.runtime.sendMessage({
    action: 'DOWNLOAD_IMAGES',
    data: {
      images: images,
      prefix: prefix,
      delay: delay
    }
  });
}

/**
 * Update control buttons based on state
 */
function updateControlButtons() {
  elements.btnStart.hidden = state.isRunning;
  elements.btnPause.hidden = !state.isRunning || state.isPaused;
  elements.btnResume.hidden = !state.isRunning || !state.isPaused;
  elements.btnStop.hidden = !state.isRunning;

  elements.promptsInput.disabled = state.isRunning;
  elements.characterUploadArea.style.pointerEvents = state.isRunning ? 'none' : 'auto';
}

/**
 * Update progress display
 */
function updateProgress(current) {
  const total = state.prompts.length;
  const percentage = total > 0 ? (current / total) * 100 : 0;

  elements.progressCurrent.textContent = current;
  elements.progressFill.style.width = `${percentage}%`;

  if (current > 0 && current <= state.prompts.length) {
    elements.currentPrompt.textContent = `"${state.prompts[current - 1].substring(0, 50)}..."`;
  }
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(status) {
  elements.connectionStatus.className = `connection-indicator ${status}`;

  switch (status) {
    case 'connected':
      elements.statusText.textContent = 'Connected';
      break;
    case 'disconnected':
      elements.statusText.textContent = 'Disconnected';
      break;
    case 'processing':
      elements.statusText.textContent = 'Processing...';
      break;
  }
}

/**
 * Handle messages from content script
 */
function handleMessage(message, sender, sendResponse) {
  switch (message.action) {
    case 'PROGRESS_UPDATE':
      updateProgress(message.data.current);
      log(`Completed ${message.data.current}/${message.data.total}: ${message.data.prompt.substring(0, 40)}...`, 'success');
      break;

    case 'GENERATION_COMPLETE':
      state.isRunning = false;
      state.isPaused = false;
      state.generatedImages = message.data.images || [];
      updateControlButtons();
      updateConnectionStatus('connected');
      log(`Generation complete! ${message.data.total} images created.`, 'success');
      saveState();
      break;

    case 'GENERATION_ERROR':
      log(`Error: ${message.data.error}`, 'error');
      if (message.data.fatal) {
        state.isRunning = false;
        state.isPaused = false;
        updateControlButtons();
        updateConnectionStatus('connected');
      }
      break;

    case 'LOG':
      log(message.data.message, message.data.type || 'info');
      break;

    case 'DOWNLOAD_PROGRESS':
      log(`Downloaded ${message.data.current}/${message.data.total}`, 'info');
      break;

    case 'DOWNLOAD_COMPLETE':
      log(`All ${message.data.total} images downloaded!`, 'success');
      break;
  }
}

/**
 * Send message to content script
 */
async function sendToContentScript(message) {
  if (!state.tabId) {
    log('No active tab found', 'error');
    return null;
  }

  try {
    const response = await chrome.tabs.sendMessage(state.tabId, message);
    return response;
  } catch (error) {
    log(`Communication error: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Get current settings
 */
function getSettings() {
  return {
    timeout: parseInt(elements.settingTimeout.value) * 1000,
    delay: parseInt(elements.settingDelay.value),
    retries: parseInt(elements.settingRetries.value),
    downloadDelay: parseInt(elements.settingDownloadDelay.value)
  };
}

/**
 * Log message to activity log
 */
function log(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;

  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;

  elements.logContainer.appendChild(entry);
  elements.logContainer.scrollTop = elements.logContainer.scrollHeight;

  // Keep only last 100 entries
  while (elements.logContainer.children.length > 100) {
    elements.logContainer.removeChild(elements.logContainer.firstChild);
  }
}

/**
 * Clear activity log
 */
function clearLog() {
  elements.logContainer.innerHTML = '';
  log('Log cleared', 'info');
}

/**
 * Scan the page for available elements (for debugging)
 */
async function scanPage() {
  log('Scanning page for elements...', 'info');

  const response = await sendToContentScript({ action: 'SCAN_PAGE' });

  if (response && response.results) {
    const r = response.results;
    log(`Scan complete: ${r.buttons.length} buttons, ${r.inputs.length} file inputs`, 'success');

    // Log all buttons with aria-labels for debugging
    r.buttons.forEach(b => {
      if (b.ariaLabel) {
        log(`  Button: "${b.ariaLabel}" (svg: ${b.hasSvg})`, 'debug');
      }
    });

    // Log file inputs
    r.inputs.forEach(inp => {
      log(`  FileInput: accept="${inp.accept}" class="${inp.className}"`, 'debug');
    });
  } else {
    log('Failed to scan page - make sure you are on Google Flow', 'error');
  }
}

/**
 * Save state to storage
 */
async function saveState() {
  const stateToSave = {
    characterImageData: state.characterImageData,
    prompts: elements.promptsInput.value,
    settings: getSettings(),
    filenamePrefix: elements.filenamePrefix.value
  };

  await chrome.storage.local.set({ flowStoryState: stateToSave });
}

/**
 * Load state from storage
 */
async function loadState() {
  const result = await chrome.storage.local.get('flowStoryState');
  const savedState = result.flowStoryState;

  if (savedState) {
    // Restore character image
    if (savedState.characterImageData) {
      state.characterImageData = savedState.characterImageData;
      elements.uploadPreview.hidden = true;
      elements.characterPreview.src = savedState.characterImageData;
      elements.characterPreview.hidden = false;
      elements.removeCharacter.hidden = false;
    }

    // Restore prompts
    if (savedState.prompts) {
      elements.promptsInput.value = savedState.prompts;
      updatePromptCount();
    }

    // Restore settings
    if (savedState.settings) {
      elements.settingTimeout.value = savedState.settings.timeout / 1000;
      elements.settingDelay.value = savedState.settings.delay;
      elements.settingRetries.value = savedState.settings.retries;
      elements.settingDownloadDelay.value = savedState.settings.downloadDelay;
    }

    // Restore filename prefix
    if (savedState.filenamePrefix) {
      elements.filenamePrefix.value = savedState.filenamePrefix;
    }

    log('Previous session restored', 'info');
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
