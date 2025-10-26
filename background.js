// Background service worker for ReWatch

const REWATCH_DEBUG_LOGGING = false;
const _rewatchOriginalConsoleLog = console.log.bind(console);
console.log = (...args) => {
  if (
    REWATCH_DEBUG_LOGGING ||
    !args.length ||
    typeof args[0] !== 'string' ||
    !args[0].startsWith('[ReWatch')
  ) {
    _rewatchOriginalConsoleLog(...args);
  }
};

console.log('[ReWatch Background] Service worker started');

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[ReWatch Background] Received message:', request.action, request);
  
  if (request.action === 'saveProgress') {
    saveProgress(request.data).then(() => {
      console.log('[ReWatch Background] Progress saved successfully');
      sendResponse({ success: true });
    }).catch(error => {
    console.error('[ReWatch Background] Error saving progress:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'getProgress') {
    getProgress(request.url).then(data => {
      console.log('[ReWatch Background] Progress retrieved:', data);
      sendResponse({ success: true, data });
    }).catch(error => {
      console.error('[ReWatch Background] Error getting progress:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

const normalizeUrlForComparison = (inputUrl) => {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return null;
  }

  try {
    const url = new URL(inputUrl);
    return `${url.origin}${url.pathname}`;
  } catch (_error) {
    const withoutHash = inputUrl.split('#')[0];
    return withoutHash.split('?')[0] || null;
  }
};

const urlsRoughlyMatch = (candidateUrl, targetUrl) => {
  const normalizedCandidate = normalizeUrlForComparison(candidateUrl);
  const normalizedTarget = normalizeUrlForComparison(targetUrl);

  if (normalizedCandidate && normalizedTarget && normalizedCandidate === normalizedTarget) {
    return true;
  }

  if (typeof candidateUrl !== 'string' || typeof targetUrl !== 'string') {
    return false;
  }

  return candidateUrl.includes(targetUrl) || targetUrl.includes(candidateUrl);
};

// Save viewing progress to Chrome storage
async function saveProgress(progressData) {
  console.log('[ReWatch Background] Saving progress:', progressData);
  
  const {
    url,
    title,
    currentTime,
    duration,
    platform,
    type,
    episodeNumber,
    seasonNumber,
    seriesTitle,
    episodeName,
    originalTitle
  } = progressData;
  
  // Create a unique key based on the content
  const contentKey = generateContentKey({
    url,
    title,
    platform,
    type,
    seriesTitle
  });
  console.log('[ReWatch Background] Generated content key:', contentKey);
  
  const derivedTitle = title || seriesTitle || originalTitle || url;
  const normalizedPlatform = (platform || '').toLowerCase();

  const data = {
    url,
    title: derivedTitle,
    currentTime,
    duration,
    platform,
    type, // 'movie' or 'episode'
    lastWatched: new Date().toISOString(),
    percentComplete: duration > 0 ? (currentTime / duration) * 100 : 0
  };
  
  // Add episode number if available
  if (episodeNumber !== undefined && episodeNumber !== null) {
    data.episodeNumber = episodeNumber;
    console.log('[ReWatch Background] Including episode number:', episodeNumber);
  }
  
  // Add season number if available
  if (seasonNumber !== undefined && seasonNumber !== null) {
    data.seasonNumber = seasonNumber;
    console.log('[ReWatch Background] Including season number:', seasonNumber);
  }

  if (seriesTitle) {
    data.seriesTitle = seriesTitle;
  }

  if (episodeName) {
    data.episodeName = episodeName;
  }

  if (originalTitle) {
    data.originalTitle = originalTitle;
  }

  if (
    data.type !== 'episode' &&
    (data.episodeNumber !== undefined || data.seasonNumber !== undefined)
  ) {
    console.log('[ReWatch Background] Episode markers detected, overriding type to episode');
    data.type = 'episode';
  }
  
  console.log('[ReWatch Background] Storing data:', data);
  
  const legacyKeyCandidates = new Set();

  if (type === 'episode') {
    const normalizedOriginalTitle = (originalTitle || '').trim();

    if (normalizedOriginalTitle) {
      const legacyEpisodeKey = generateContentKey({
        url,
        title: normalizedOriginalTitle,
        platform,
        type: 'episode',
        seriesTitle: null
      });
      if (legacyEpisodeKey && legacyEpisodeKey !== contentKey) {
        legacyKeyCandidates.add(legacyEpisodeKey);
      }

      const legacyMovieKey = generateContentKey({
        url,
        title: normalizedOriginalTitle,
        platform,
        type: 'movie',
        seriesTitle: null
      });
      if (legacyMovieKey && legacyMovieKey !== contentKey) {
        legacyKeyCandidates.add(legacyMovieKey);
      }
    }

    if (url) {
      const legacyUrlKey = generateContentKey({
        url,
        title: '',
        platform,
        type: 'movie',
        seriesTitle: null
      });
      if (legacyUrlKey && legacyUrlKey !== contentKey) {
        legacyKeyCandidates.add(legacyUrlKey);
      }
    }
  }

  // Store the progress
  await chrome.storage.local.set({ [contentKey]: data });
  
  const legacyKeysArray = Array.from(legacyKeyCandidates);
  const keysToFetch = ['trackedContent', ...legacyKeysArray];
  const result = await chrome.storage.local.get(keysToFetch);
  let trackedContent = result.trackedContent || [];

  const legacyKeysToRemove = legacyKeysArray.filter(key => Object.prototype.hasOwnProperty.call(result, key));

  if (legacyKeysToRemove.length > 0) {
    await chrome.storage.local.remove(legacyKeysToRemove);
    trackedContent = trackedContent.filter(key => !legacyKeysToRemove.includes(key));
    console.log('[ReWatch Background] Removed legacy content keys:', legacyKeysToRemove);
  }
  
  if (!trackedContent.includes(contentKey)) {
    trackedContent.push(contentKey);
    await chrome.storage.local.set({ trackedContent });
    console.log('[ReWatch Background] Added to tracked content list');
  }

  // Remove older episode entries for the same series to avoid duplicates
  if (type === 'episode' && seriesTitle) {
    const normalizedSeries = seriesTitle.trim().toLowerCase();
    if (normalizedSeries) {
      const existingEntries = await chrome.storage.local.get(trackedContent);
      const keysToRemove = [];

      for (const key of trackedContent) {
        if (key === contentKey) {
          continue;
        }

        const entry = existingEntries[key];
        if (!entry) {
          continue;
        }

        const entrySeries = (entry.seriesTitle || entry.title || '').trim().toLowerCase();
        const sameSeries = entrySeries && entrySeries === normalizedSeries;
        const entryPlatform = (entry.platform || '').toLowerCase();
        const samePlatform = !normalizedPlatform || entryPlatform === normalizedPlatform;

        const episodeNameHasValue = typeof entry.episodeName === 'string' && entry.episodeName.trim().length > 0;
        const episodicPattern = /\b(e|episode)\s*\d+/i;
        const titleLooksEpisodic = episodicPattern.test(entry.title || '') || episodicPattern.test(entry.originalTitle || '');
        const looksEpisodic = entry.type === 'episode' || typeof entry.episodeNumber === 'number' || typeof entry.seasonNumber === 'number' || episodeNameHasValue || titleLooksEpisodic;

        if (sameSeries && samePlatform && looksEpisodic) {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        const updatedTracked = trackedContent.filter(key => !keysToRemove.includes(key));
        await chrome.storage.local.set({ trackedContent: updatedTracked });
        console.log('[ReWatch Background] Removed duplicate episode entries for series:', seriesTitle);
      }
    }
  }
  
  console.log('[ReWatch Background] Save complete');

  cleanupOldEntries().catch((error) => {
    console.log('[ReWatch Background] Cleanup skipped:', error.message);
  });
}

// Get progress for a specific URL
async function getProgress(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const { trackedContent = [] } = await chrome.storage.local.get('trackedContent');
  let fallbackMatch = null;

  if (Array.isArray(trackedContent) && trackedContent.length > 0) {
    const entries = await chrome.storage.local.get(trackedContent);
    for (const key of trackedContent) {
      const entry = entries[key];
      if (!entry || typeof entry.url !== 'string') {
        continue;
      }

      if (urlsRoughlyMatch(entry.url, url)) {
        return entry;
      }

      if (!fallbackMatch && entry.url.includes(url)) {
        fallbackMatch = entry;
      }
    }
  }

  if (fallbackMatch) {
    return fallbackMatch;
  }

  const allEntries = await chrome.storage.local.get(null);
  for (const value of Object.values(allEntries)) {
    if (value && typeof value.url === 'string' && urlsRoughlyMatch(value.url, url)) {
      return value;
    }
  }

  return null;
}

// Generate a unique key for content
function generateContentKey({ url, title, platform, type, seriesTitle }) {
  const safeUrl = typeof url === 'string' ? url.split('?')[0] : '';
  const normalizedPlatform = (platform || '').toLowerCase();
  const normalize = value => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  let keyBasis;

  if (type === 'episode' && seriesTitle) {
    keyBasis = `${normalizedPlatform}|series|${normalize(seriesTitle)}`;
  } else {
    const normalizedTitle = normalize(title);
    keyBasis = `${normalizedPlatform}|title|${normalizedTitle || normalize(safeUrl)}`;
  }

  if (!keyBasis || keyBasis === '||') {
    keyBasis = `${normalizedPlatform}|fallback|${normalize(safeUrl)}`;
  }

  const combined = keyBasis;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `content_${Math.abs(hash)}`;
}

// Clean up old entries (optional - can be called periodically)
async function cleanupOldEntries() {
  const result = await chrome.storage.local.get(null);
  const entries = { ...result };
  const trackedContent = Array.isArray(entries.trackedContent) ? entries.trackedContent.slice() : [];
  delete entries.trackedContent;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const keysToRemove = [];

  for (const [key, value] of Object.entries(entries)) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    if (!value.lastWatched) {
      continue;
    }

    const lastWatchedDate = new Date(value.lastWatched);
    if (Number.isNaN(lastWatchedDate.getTime())) {
      continue;
    }

    if (lastWatchedDate < sixMonthsAgo && Number.isFinite(value.percentComplete) && value.percentComplete >= 95) {
      keysToRemove.push(key);
    }
  }

  if (!keysToRemove.length) {
    return;
  }

  await chrome.storage.local.remove(keysToRemove);

  if (trackedContent.length) {
    const filteredTracked = trackedContent.filter((key) => !keysToRemove.includes(key));
    await chrome.storage.local.set({ trackedContent: filteredTracked });
  }

  console.log('[ReWatch Background] Cleaned up old entries:', keysToRemove);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    saveProgress,
    getProgress,
    cleanupOldEntries,
    generateContentKey,
    urlsRoughlyMatch,
    normalizeUrlForComparison
  };
}
