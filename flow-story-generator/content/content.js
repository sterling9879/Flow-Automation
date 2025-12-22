/**
 * Flow Story Generator - Content Script
 * Handles page automation and interaction with Google Flow
 */

// Selectors based on documentation - with multiple fallbacks
const SELECTORS = {
  promptTextarea: 'textarea#PINHOLE_TEXT_AREA_ELEMENT_ID',
  createButton: 'button[aria-label="Create"]',
  addToPromptButton: 'button[aria-label*="Add To Prompt"]',
  removeFromPromptButton: 'button[aria-label="Remove From Prompt"]',
  // Multiple selectors for add ingredient button
  // NOTE: These buttons use Google Symbols icons, not aria-labels!
  addIngredientButton: [
    // Primary: button with <i> containing "add" text (Google Symbols icon)
    'button:has(i.google-symbols)',
    'button.sc-c177465c-1',  // Specific class from actual page
    'button.sc-d02e9a37-1',  // Alternative class
    // Fallback aria-label selectors (in case they add them later)
    'button[aria-label="add"]',
    'button[aria-label="Add"]',
    'button[aria-label*="add ingredient"]',
    'button[aria-label*="upload"]',
    'button[aria-label*="Upload"]'
  ],
  fileInput: [
    'input[type="file"].sc-8770743f-0',  // Specific class from docs
    'input[type="file"].sc-8770743f-0.kyRuKy',  // Full class from docs
    'input[type="file"]',
    'input[type="file"][accept*="image"]',
    'input[accept=".png,.jpg,.jpeg,.webp,.heic,.avif"]'
  ],
  generatedImages: 'img[alt*="Flow Image"]',
  imageCard: '.sc-6349d8ef-0',  // Container principal do card from docs
  closeModalButton: [
    'button[aria-label="close"]',
    'button[aria-label="Close"]',
    'button[aria-label*="close"]',
    '[role="dialog"] button[aria-label*="close"]',
    '[role="dialog"] button:first-child'
  ],
  uploadButton: [
    // Primary: button with "upload" icon and "Upload" text
    'button.sc-fbea20b2-0',  // Specific class from actual page
    'button:has(i.google-symbols)',
    'button[aria-label*="Upload"]',
    'button[aria-label*="upload"]'
  ]
};

// State management
const automationState = {
  isRunning: false,
  isPaused: false,
  prompts: [],
  currentIndex: 0,
  characterImageData: null,
  settings: {
    timeout: 60000,
    delay: 2000,
    retries: 3,
    downloadDelay: 500
  },
  generatedImages: [],
  lastGeneratedCount: 0
};

/**
 * Wait for an element to appear in the DOM
 * @param {string} selector - CSS selector
 * @param {number} timeout - Maximum wait time in ms
 * @returns {Promise<Element|null>}
 */
async function waitForElement(selector, timeout = 30000) {
  const startTime = Date.now();

  return new Promise((resolve) => {
    // Check if element already exists
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    // Set up observer
    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Timeout check
    const checkTimeout = setInterval(() => {
      if (Date.now() - startTime > timeout) {
        observer.disconnect();
        clearInterval(checkTimeout);
        resolve(null);
      }
    }, 100);
  });
}

/**
 * Wait for multiple elements to appear
 * @param {string} selector - CSS selector
 * @param {number} minCount - Minimum number of elements
 * @param {number} timeout - Maximum wait time in ms
 * @returns {Promise<NodeList|null>}
 */
async function waitForElements(selector, minCount = 1, timeout = 30000) {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const check = () => {
      const elements = document.querySelectorAll(selector);
      if (elements.length >= minCount) {
        resolve(elements);
        return true;
      }
      return false;
    };

    if (check()) return;

    const observer = new MutationObserver(() => {
      if (check()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

    const checkTimeout = setInterval(() => {
      if (Date.now() - startTime > timeout) {
        observer.disconnect();
        clearInterval(checkTimeout);
        const elements = document.querySelectorAll(selector);
        resolve(elements.length > 0 ? elements : null);
      }
    }, 100);
  });
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Try multiple selectors and return first matching element
 * @param {string|string[]} selectors - Single selector or array of selectors
 * @returns {Element|null}
 */
function findElementBySelectors(selectors) {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];

  for (const selector of selectorList) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`[Flow Story Generator] Found element with selector: ${selector}`);
        return element;
      }
    } catch (e) {
      // Invalid selector, skip
      console.log(`[Flow Story Generator] Invalid selector: ${selector}`);
    }
  }
  return null;
}

/**
 * Wait for any of multiple selectors to appear
 * @param {string|string[]} selectors - Single selector or array of selectors
 * @param {number} timeout - Maximum wait time in ms
 * @returns {Promise<Element|null>}
 */
async function waitForAnyElement(selectors, timeout = 30000) {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  const startTime = Date.now();

  return new Promise((resolve) => {
    // Check if any element already exists
    const existing = findElementBySelectors(selectorList);
    if (existing) {
      resolve(existing);
      return;
    }

    // Set up observer
    const observer = new MutationObserver(() => {
      const element = findElementBySelectors(selectorList);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

    // Timeout check with polling
    const checkInterval = setInterval(() => {
      const element = findElementBySelectors(selectorList);
      if (element) {
        observer.disconnect();
        clearInterval(checkInterval);
        resolve(element);
        return;
      }

      if (Date.now() - startTime > timeout) {
        observer.disconnect();
        clearInterval(checkInterval);
        resolve(null);
      }
    }, 200);
  });
}

/**
 * Log all buttons on page for debugging
 */
function debugLogButtons() {
  const buttons = document.querySelectorAll('button');
  console.log(`[Flow Story Generator] Found ${buttons.length} buttons on page:`);
  buttons.forEach((btn, i) => {
    const ariaLabel = btn.getAttribute('aria-label');
    const text = btn.textContent?.trim().substring(0, 50);
    const classes = btn.className;
    if (ariaLabel || text) {
      console.log(`  ${i}: aria-label="${ariaLabel}" text="${text}" class="${classes}"`);
    }
  });
}

/**
 * Write text to the prompt textarea
 * @param {string} text - Text to write
 */
async function writePrompt(text) {
  const textarea = await waitForElement(SELECTORS.promptTextarea);
  if (!textarea) {
    throw new Error('Prompt textarea not found');
  }

  // Clear existing content
  textarea.value = '';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(100);

  // Write new content
  textarea.value = text;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));

  // Focus and trigger any React handlers
  textarea.focus();
  textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

  await sleep(200);
  sendLog(`Prompt written: "${text.substring(0, 50)}..."`, 'info');
}

/**
 * Clear the prompt textarea
 */
async function clearPrompt() {
  const textarea = await waitForElement(SELECTORS.promptTextarea);
  if (textarea) {
    textarea.value = '';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(100);
  }
}

/**
 * Upload character image as ingredient
 * @param {string} imageData - Base64 image data
 */
async function uploadCharacterImage(imageData) {
  sendLog('Uploading character image...', 'info');

  // Debug: log available buttons
  debugLogButtons();

  // Method 1: Try to find and click the add ingredient button
  let addButton = await waitForAnyElement(SELECTORS.addIngredientButton, 5000);

  // Method 2: If not found, look for buttons with Google Symbols icons
  if (!addButton) {
    sendLog('Add button not found with standard selectors, trying icon text detection...', 'warning');

    // Look for buttons with Google Symbols icons containing "add"
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      // Check for <i> elements with google-symbols class containing "add" text
      const iconElement = btn.querySelector('i.google-symbols, i[class*="google-symbols"]');
      if (iconElement) {
        const iconText = iconElement.textContent?.trim().toLowerCase() || '';
        if (iconText === 'add' || iconText === 'add_circle' || iconText === 'add_box') {
          addButton = btn;
          sendLog(`Found add button via Google Symbols icon: "${iconText}"`, 'info');
          break;
        }
      }

      // Also check for any <i> element with "add" text
      const anyIcon = btn.querySelector('i');
      if (anyIcon) {
        const iconText = anyIcon.textContent?.trim().toLowerCase() || '';
        if (iconText === 'add') {
          addButton = btn;
          sendLog(`Found add button via icon text: "${iconText}"`, 'info');
          break;
        }
      }
    }
  }

  // Method 3: Try to find file input directly (might be already visible)
  let fileInput = findElementBySelectors(SELECTORS.fileInput);

  if (!addButton && !fileInput) {
    // Last resort: look for any hidden file input and try to use it directly
    const hiddenInputs = document.querySelectorAll('input[type="file"]');
    if (hiddenInputs.length > 0) {
      fileInput = hiddenInputs[0];
      sendLog('Found hidden file input directly', 'info');
    }
  }

  // If we found an add button, click it
  if (addButton && !fileInput) {
    sendLog('Clicking add ingredient button...', 'info');
    addButton.click();
    await sleep(800);

    // Now look for the file input in the modal
    fileInput = await waitForAnyElement(SELECTORS.fileInput, 5000);
  }

  if (!fileInput) {
    // Final attempt: look for any file input again after potential modal opened
    await sleep(500);
    fileInput = findElementBySelectors(SELECTORS.fileInput);
  }

  if (!fileInput) {
    await closeModal();
    throw new Error('File input not found. Please check browser console for available buttons.');
  }

  // Convert base64 to File object
  const response = await fetch(imageData);
  const blob = await response.blob();
  const file = new File([blob], 'character.png', { type: 'image/png' });

  // Create DataTransfer and set files
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;

  // Dispatch multiple events to ensure React picks it up
  fileInput.dispatchEvent(new Event('input', { bubbles: true }));
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));

  // Also try native input event
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files')?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(fileInput, dataTransfer.files);
    fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  sendLog('File input populated, waiting for upload...', 'info');

  // Wait for upload to complete
  await sleep(2000);

  // Close modal if still open
  await closeModal();

  sendLog('Character image uploaded', 'success');
}

/**
 * Close any open modal
 */
async function closeModal() {
  // Try multiple close button selectors
  const closeButton = findElementBySelectors(SELECTORS.closeModalButton);
  if (closeButton) {
    closeButton.click();
    await sleep(300);
    return;
  }

  // Try clicking outside modal (backdrop)
  const backdrop = document.querySelector('[role="dialog"]')?.parentElement;
  if (backdrop) {
    backdrop.click();
    await sleep(300);
  }

  // Try pressing Escape
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    keyCode: 27,
    which: 27,
    bubbles: true
  }));
  await sleep(300);
}

/**
 * Click "Add To Prompt" on the last generated image
 */
async function addLastImageToPrompt() {
  sendLog('Adding last image to prompt...', 'info');

  const images = document.querySelectorAll(SELECTORS.generatedImages);
  if (images.length === 0) {
    sendLog('No images found to add', 'warning');
    return false;
  }

  // Get the last image's container
  const lastImage = images[images.length - 1];

  // Find the Add To Prompt button in the same card/container
  // Navigate up to find the parent container that has the button
  let container = lastImage.closest('[data-index]') || lastImage.parentElement;
  let attempts = 0;

  while (container && attempts < 10) {
    const addButton = container.querySelector(SELECTORS.addToPromptButton);
    if (addButton) {
      addButton.click();
      await sleep(500);
      sendLog('Last image added to prompt', 'success');
      return true;
    }
    container = container.parentElement;
    attempts++;
  }

  // If not found in container, try finding by proximity or just use first available
  const allAddButtons = document.querySelectorAll(SELECTORS.addToPromptButton);
  if (allAddButtons.length > 0) {
    // Click the last Add To Prompt button (most recent image)
    allAddButtons[allAddButtons.length - 1].click();
    await sleep(500);
    sendLog('Added most recent image to prompt', 'success');
    return true;
  }

  sendLog('Could not find Add To Prompt button', 'warning');
  return false;
}

/**
 * Click the Create button to start generation
 */
async function clickCreate() {
  const createButton = await waitForElement(SELECTORS.createButton);
  if (!createButton) {
    throw new Error('Create button not found');
  }

  createButton.click();
  sendLog('Generation started...', 'info');
}

/**
 * Wait for image generation to complete
 * @param {number} timeout - Maximum wait time in ms
 * @returns {Promise<boolean>}
 */
async function waitForGenerationComplete(timeout = 60000) {
  const startTime = Date.now();
  const initialCount = document.querySelectorAll(SELECTORS.generatedImages).length;

  sendLog(`Waiting for generation... (${initialCount} images currently)`, 'info');

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const currentImages = document.querySelectorAll(SELECTORS.generatedImages);

      // Check if new images appeared
      if (currentImages.length > initialCount) {
        observer.disconnect();
        automationState.lastGeneratedCount = currentImages.length;
        sendLog(`Generation complete! New total: ${currentImages.length} images`, 'success');
        resolve(true);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also poll for progress indicators disappearing
    const pollInterval = setInterval(() => {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        observer.disconnect();
        clearInterval(pollInterval);
        sendLog('Generation timeout', 'warning');
        resolve(false);
      }

      // Check for new images
      const currentImages = document.querySelectorAll(SELECTORS.generatedImages);
      if (currentImages.length > initialCount) {
        observer.disconnect();
        clearInterval(pollInterval);
        automationState.lastGeneratedCount = currentImages.length;
        sendLog(`Generation complete! New total: ${currentImages.length} images`, 'success');
        resolve(true);
      }
    }, 1000);
  });
}

/**
 * Extract all generated images data
 * @returns {Array} Array of image objects with url, prompt, and order
 */
function extractAllImages() {
  const images = document.querySelectorAll(SELECTORS.generatedImages);
  const imageData = [];

  images.forEach((img, index) => {
    // Get the data-index from parent container if available
    const parentWithIndex = img.closest('[data-index]');
    const dataIndex = parentWithIndex ? parseInt(parentWithIndex.getAttribute('data-index')) : index;

    imageData.push({
      url: img.src,
      prompt: img.alt.replace('Flow Image: ', ''),
      order: dataIndex,
      index: index
    });
  });

  // Sort by order/index to maintain sequence
  imageData.sort((a, b) => a.order - b.order);

  return imageData;
}

/**
 * Process a single prompt
 * @param {string} promptText - The prompt text
 * @param {boolean} isFirst - Whether this is the first prompt
 * @param {string} characterImageData - Base64 character image data
 * @returns {Promise<boolean>} Success status
 */
async function processPrompt(promptText, isFirst, characterImageData) {
  const { retries, timeout } = automationState.settings;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      sendLog(`Processing prompt (attempt ${attempt}/${retries}): "${promptText.substring(0, 40)}..."`, 'info');

      // Clear current prompt
      await clearPrompt();
      await sleep(300);

      // Upload character image
      await uploadCharacterImage(characterImageData);
      await sleep(500);

      // If not first prompt, add the last generated image
      if (!isFirst) {
        await addLastImageToPrompt();
        await sleep(500);
      }

      // Write the prompt
      await writePrompt(promptText);
      await sleep(300);

      // Click create
      await clickCreate();

      // Wait for generation
      const success = await waitForGenerationComplete(timeout);

      if (success) {
        return true;
      }

      sendLog(`Attempt ${attempt} failed, retrying...`, 'warning');
    } catch (error) {
      sendLog(`Error on attempt ${attempt}: ${error.message}`, 'error');
    }

    if (attempt < retries) {
      await sleep(2000);
    }
  }

  sendLog(`Failed to process prompt after ${retries} attempts`, 'error');
  return false;
}

/**
 * Main automation loop
 */
async function runAutomation() {
  const { prompts, characterImageData, settings } = automationState;

  for (let i = automationState.currentIndex; i < prompts.length; i++) {
    // Check if paused or stopped
    if (!automationState.isRunning) {
      sendLog('Automation stopped', 'warning');
      break;
    }

    while (automationState.isPaused) {
      await sleep(500);
      if (!automationState.isRunning) break;
    }

    if (!automationState.isRunning) break;

    automationState.currentIndex = i;
    const prompt = prompts[i];
    const isFirst = i === 0;

    // Send progress update
    sendProgressUpdate(i, prompts.length, prompt);

    // Process the prompt
    const success = await processPrompt(prompt, isFirst, characterImageData);

    if (!success) {
      sendError(`Failed to generate image for prompt ${i + 1}`, false);
    }

    // Send progress update after completion
    sendProgressUpdate(i + 1, prompts.length, prompt);

    // Delay before next prompt
    if (i < prompts.length - 1) {
      await sleep(settings.delay);
    }
  }

  // Complete
  automationState.isRunning = false;
  automationState.generatedImages = extractAllImages();

  chrome.runtime.sendMessage({
    action: 'GENERATION_COMPLETE',
    data: {
      total: automationState.generatedImages.length,
      images: automationState.generatedImages
    }
  });
}

/**
 * Send progress update to popup
 */
function sendProgressUpdate(current, total, prompt) {
  chrome.runtime.sendMessage({
    action: 'PROGRESS_UPDATE',
    data: { current, total, prompt }
  });
}

/**
 * Send log message to popup
 */
function sendLog(message, type = 'info') {
  chrome.runtime.sendMessage({
    action: 'LOG',
    data: { message, type }
  });
}

/**
 * Send error to popup
 */
function sendError(error, fatal = false) {
  chrome.runtime.sendMessage({
    action: 'GENERATION_ERROR',
    data: { error, fatal }
  });
}

/**
 * Scan page and return information about available elements
 */
function scanPage() {
  const results = {
    buttons: [],
    inputs: [],
    textareas: [],
    images: []
  };

  // Scan buttons
  document.querySelectorAll('button').forEach((btn, i) => {
    const ariaLabel = btn.getAttribute('aria-label');
    const text = btn.textContent?.trim().substring(0, 50);
    const hasSvg = btn.querySelector('svg') !== null;
    // Check for Google Symbols icons
    const iconElement = btn.querySelector('i.google-symbols, i[class*="google-symbols"], i');
    const iconText = iconElement?.textContent?.trim() || null;
    const className = btn.className?.substring(0, 50) || '';

    if (ariaLabel || text || iconText) {
      results.buttons.push({
        index: i,
        ariaLabel,
        text,
        iconText,
        className,
        hasSvg,
        visible: btn.offsetParent !== null
      });
    }
  });

  // Scan file inputs
  document.querySelectorAll('input[type="file"]').forEach((input, i) => {
    results.inputs.push({
      index: i,
      accept: input.accept,
      visible: input.offsetParent !== null,
      className: input.className
    });
  });

  // Scan textareas
  document.querySelectorAll('textarea').forEach((ta, i) => {
    results.textareas.push({
      index: i,
      id: ta.id,
      placeholder: ta.placeholder?.substring(0, 50),
      visible: ta.offsetParent !== null
    });
  });

  // Scan generated images
  document.querySelectorAll('img[alt*="Flow"]').forEach((img, i) => {
    results.images.push({
      index: i,
      alt: img.alt?.substring(0, 50),
      hasSource: !!img.src
    });
  });

  return results;
}

/**
 * Message listener for commands from popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'START_GENERATION':
      automationState.isRunning = true;
      automationState.isPaused = false;
      automationState.prompts = message.data.prompts;
      automationState.characterImageData = message.data.characterImageData;
      automationState.settings = message.data.settings;
      automationState.currentIndex = 0;
      automationState.generatedImages = [];

      // Start automation in background
      runAutomation();
      sendResponse({ success: true });
      break;

    case 'PAUSE_GENERATION':
      automationState.isPaused = true;
      sendResponse({ success: true });
      break;

    case 'RESUME_GENERATION':
      automationState.isPaused = false;
      sendResponse({ success: true });
      break;

    case 'STOP_GENERATION':
      automationState.isRunning = false;
      automationState.isPaused = false;
      sendResponse({ success: true });
      break;

    case 'GET_ALL_IMAGES':
      const images = extractAllImages();
      sendResponse({ images });
      break;

    case 'SCAN_PAGE':
      const scanResults = scanPage();
      sendLog(`Found: ${scanResults.buttons.length} buttons, ${scanResults.inputs.length} file inputs, ${scanResults.textareas.length} textareas`, 'info');

      // Log buttons with relevant aria-labels OR icon text
      const relevantButtons = scanResults.buttons.filter(b => {
        const label = (b.ariaLabel || '').toLowerCase();
        const icon = (b.iconText || '').toLowerCase();
        return (
          label.includes('add') || label.includes('create') ||
          label.includes('upload') || label.includes('close') ||
          icon === 'add' || icon === 'upload' || icon === 'close'
        );
      });
      relevantButtons.forEach(b => {
        const identifier = b.ariaLabel || `icon:${b.iconText}` || b.text?.substring(0, 20);
        sendLog(`Button: "${identifier}" class="${b.className}" (visible: ${b.visible})`, 'debug');
      });

      sendResponse({ results: scanResults });
      break;

    case 'PING':
      sendResponse({ pong: true });
      break;

    default:
      sendResponse({ error: 'Unknown action' });
  }

  // Return true to indicate async response
  return true;
});

// Log that content script is loaded
console.log('[Flow Story Generator] Content script loaded');
sendLog('Content script initialized', 'info');
