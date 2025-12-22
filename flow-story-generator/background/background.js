/**
 * Flow Story Generator - Background Service Worker
 * Handles downloads and background tasks
 */

// Download queue state
const downloadState = {
  isDownloading: false,
  queue: [],
  completed: 0,
  total: 0,
  prefix: 'story',
  delay: 500
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Download a single image
 * @param {string} url - Image URL
 * @param {string} filename - Filename to save as
 * @returns {Promise<boolean>} Success status
 */
async function downloadImage(url, filename) {
  return new Promise((resolve) => {
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download error:', chrome.runtime.lastError);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Process download queue
 */
async function processDownloadQueue() {
  if (downloadState.isDownloading) return;

  downloadState.isDownloading = true;
  downloadState.completed = 0;
  downloadState.total = downloadState.queue.length;

  console.log(`[Flow Story Generator] Starting download of ${downloadState.total} images`);

  for (let i = 0; i < downloadState.queue.length; i++) {
    const item = downloadState.queue[i];

    // Generate filename with padding
    const paddedIndex = String(i + 1).padStart(3, '0');
    const filename = `${downloadState.prefix}_${paddedIndex}.png`;

    try {
      const success = await downloadImage(item.url, filename);

      if (success) {
        downloadState.completed++;
        console.log(`[Flow Story Generator] Downloaded ${downloadState.completed}/${downloadState.total}: ${filename}`);

        // Send progress update
        broadcastMessage({
          action: 'DOWNLOAD_PROGRESS',
          data: {
            current: downloadState.completed,
            total: downloadState.total,
            filename: filename
          }
        });
      }
    } catch (error) {
      console.error(`[Flow Story Generator] Failed to download ${filename}:`, error);
    }

    // Delay between downloads to avoid rate limiting
    if (i < downloadState.queue.length - 1) {
      await sleep(downloadState.delay);
    }
  }

  // Complete
  downloadState.isDownloading = false;
  downloadState.queue = [];

  broadcastMessage({
    action: 'DOWNLOAD_COMPLETE',
    data: {
      total: downloadState.completed
    }
  });

  console.log(`[Flow Story Generator] Download complete! ${downloadState.completed} images saved.`);
}

/**
 * Broadcast message to all extension contexts
 */
function broadcastMessage(message) {
  // Send to popup if open
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might be closed, ignore error
  });

  // Send to all tabs with content script
  chrome.tabs.query({ url: 'https://labs.google/fx/*' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Tab might not have content script, ignore
      });
    });
  });
}

/**
 * Message listener
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'DOWNLOAD_IMAGES':
      if (message.data && message.data.images) {
        downloadState.queue = message.data.images;
        downloadState.prefix = message.data.prefix || 'story';
        downloadState.delay = message.data.delay || 500;
        processDownloadQueue();
        sendResponse({ success: true, total: message.data.images.length });
      } else {
        sendResponse({ success: false, error: 'No images provided' });
      }
      break;

    case 'DOWNLOAD_SINGLE':
      if (message.data && message.data.url) {
        downloadImage(message.data.url, message.data.filename || 'flow_image.png')
          .then(success => sendResponse({ success }));
        return true; // Async response
      }
      break;

    case 'GET_DOWNLOAD_STATUS':
      sendResponse({
        isDownloading: downloadState.isDownloading,
        completed: downloadState.completed,
        total: downloadState.total
      });
      break;

    default:
      // Forward other messages to popup/content script
      break;
  }

  return true;
});

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Flow Story Generator] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[Flow Story Generator] Extension updated');
  }
});

console.log('[Flow Story Generator] Background service worker started');
