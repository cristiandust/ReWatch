import { StoredContentItem, StoredContentType, isStoredContentItem } from '@shared/content';
const REWATCH_DEBUG_LOGGING = true;

const originalConsoleLog = console.log.bind(console);
console.log = (...args: unknown[]) => {
  if (
    REWATCH_DEBUG_LOGGING ||
    args.length === 0 ||
    typeof args[0] !== 'string' ||
    !args[0].startsWith('[ReWatch')
  ) {
    originalConsoleLog(...args);
  }
};

console.log('[ReWatch Background] Service worker started');

type SaveProgressPayload = {
  url: string;
  title?: string;
  currentTime: number;
  duration: number;
  platform?: string;
  type?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  seriesTitle?: string;
  episodeName?: string;
  originalTitle?: string;
};

type RuntimeRequest =
  | {
      action: 'saveProgress';
      data: SaveProgressPayload;
    }
  | {
      action: 'getProgress';
      url: string;
    }
  | {
      action: 'debugLog';
      message: string;
      data?: Record<string, unknown>;
    };

type ChromeStorageArea = {
  get: (keys?: string | string[] | Record<string, unknown> | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

type ChromeRuntime = {
  onMessage: {
    addListener: (
      callback: (
        request: RuntimeRequest,
        sender: unknown,
        sendResponse: (response: { success: boolean; data?: unknown; error?: string }) => void
      ) => void
    ) => void;
  };
};

type ChromeApi = {
  runtime?: ChromeRuntime;
  storage?: {
    local?: ChromeStorageArea;
  };
};

type ChromeGlobal = {
  chrome?: ChromeApi;
};

const chromeApi = (globalThis as ChromeGlobal).chrome;

const assertChromeStorage = (): ChromeStorageArea => {
  const storage = chromeApi?.storage?.local;
  if (!storage) {
    throw new Error('Chrome storage API unavailable');
  }
  return storage;
};

const normalizeUrlForComparison = (inputUrl: string | null | undefined): string | null => {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return null;
  }
  try {
    const url = new URL(inputUrl);
    return `${url.origin}${url.pathname}`;
  } catch (error) {
    console.log('[ReWatch][Background] Failed to normalize URL:', (error as Error).message);
    const withoutHash = inputUrl.split('#')[0] ?? '';
    return withoutHash.split('?')[0] ?? null;
  }
};

const urlsRoughlyMatch = (candidateUrl: string | null | undefined, targetUrl: string | null | undefined): boolean => {
  const normalizedCandidate = normalizeUrlForComparison(candidateUrl);
  const normalizedTarget = normalizeUrlForComparison(targetUrl);
  if (normalizedCandidate && normalizedTarget && normalizedCandidate === normalizedTarget) {
    return true;
  }
  if (!candidateUrl || !targetUrl) {
    return false;
  }
  return candidateUrl.includes(targetUrl) || targetUrl.includes(candidateUrl);
};

const generateContentKey = ({
  url,
  title,
  platform,
  type,
  seriesTitle
}: {
  url?: string;
  title?: string;
  platform?: string;
  type?: string | null;
  seriesTitle?: string | null;
}): string => {
  const safeUrl = typeof url === 'string' ? url.split('?')[0] ?? '' : '';
  const normalizedPlatform = (platform ?? '').toLowerCase();
  const normalize = (value: string | undefined | null) => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let keyBasis: string;
  if (type === 'episode' && seriesTitle) {
    keyBasis = `${normalizedPlatform}|series|${normalize(seriesTitle)}`;
  } else {
    const normalizedTitle = normalize(title);
    keyBasis = `${normalizedPlatform}|title|${normalizedTitle || normalize(safeUrl)}`;
  }
  if (!keyBasis || keyBasis === '||') {
    keyBasis = `${normalizedPlatform}|fallback|${normalize(safeUrl)}`;
  }
  let hash = 0;
  for (let index = 0; index < keyBasis.length; index += 1) {
    const charCode = keyBasis.charCodeAt(index);
    hash = ((hash << 5) - hash) + charCode;
    hash |= 0;
  }
  return `content_${Math.abs(hash)}`;
};

const clampPercentage = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
};

const toNumber = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return value;
};

const saveProgress = async (progressData: SaveProgressPayload): Promise<void> => {
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
  const contentKey = generateContentKey({
    url,
    title,
    platform,
    type,
    seriesTitle
  });
  console.log('[ReWatch Background] Generated content key:', contentKey);
  const derivedTitle = title || seriesTitle || originalTitle || url;
  const normalizedPlatform = (platform ?? '').toLowerCase();
  const sanitizedCurrentTime = toNumber(currentTime);
  const sanitizedDuration = toNumber(duration);
  const normalizedType: StoredContentType = type === 'episode' ? 'episode' : 'movie';
  const percentComplete = sanitizedDuration > 0 ? clampPercentage((sanitizedCurrentTime / sanitizedDuration) * 100) : 0;
  const data: StoredContentItem = {
    url,
    title: derivedTitle,
    currentTime: sanitizedCurrentTime,
    duration: sanitizedDuration,
    platform,
    type: normalizedType,
    lastWatched: new Date().toISOString(),
    percentComplete
  };
  if (episodeNumber !== undefined && episodeNumber !== null) {
    data.episodeNumber = episodeNumber;
    console.log('[ReWatch Background] Including episode number:', episodeNumber);
  }
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
  const storage = assertChromeStorage();
  const legacyKeyCandidates = new Set<string>();
  if (type === 'episode') {
    const normalizedOriginalTitle = (originalTitle ?? '').trim();
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
  await storage.set({ [contentKey]: data });
  const legacyKeysArray = Array.from(legacyKeyCandidates);
  const keysToFetch = ['trackedContent', ...legacyKeysArray];
  const result = await storage.get(keysToFetch);
  const trackedContentRaw = result.trackedContent;
  const trackedContent = Array.isArray(trackedContentRaw)
    ? trackedContentRaw.filter((value): value is string => typeof value === 'string')
    : [];
  const legacyKeysToRemove = legacyKeysArray.filter((key) => Object.prototype.hasOwnProperty.call(result, key));
  if (legacyKeysToRemove.length > 0) {
    await storage.remove(legacyKeysToRemove);
    const filteredTracked = trackedContent.filter((key) => !legacyKeysToRemove.includes(key));
    await storage.set({ trackedContent: filteredTracked });
    console.log('[ReWatch Background] Removed legacy content keys:', legacyKeysToRemove);
  }
  const refreshedStorage = legacyKeysToRemove.length > 0 ? await storage.get('trackedContent') : { trackedContent };
  const currentTrackedRaw = refreshedStorage.trackedContent;
  const currentTracked = Array.isArray(currentTrackedRaw)
    ? currentTrackedRaw.filter((value): value is string => typeof value === 'string')
    : [];
  if (!currentTracked.includes(contentKey)) {
    const updatedTracked = [...currentTracked, contentKey];
    await storage.set({ trackedContent: updatedTracked });
    console.log('[ReWatch Background] Added to tracked content list');
  }
  if (type === 'episode' && seriesTitle) {
    const normalizedSeries = seriesTitle.trim().toLowerCase();
    if (normalizedSeries) {
      const trackedSnapshot = await storage.get('trackedContent');
      const trackedListRaw = trackedSnapshot.trackedContent;
      const trackedList = Array.isArray(trackedListRaw)
        ? trackedListRaw.filter((value): value is string => typeof value === 'string')
        : [];
      const existingEntries = trackedList.length ? await storage.get(trackedList) : {};
      const keysToRemove: string[] = [];
      for (const key of trackedList) {
        if (key === contentKey) {
          continue;
        }
        const entry = existingEntries[key];
        if (!isStoredContentItem(entry)) {
          continue;
        }
        const entrySeries = (entry.seriesTitle ?? entry.title ?? '').trim().toLowerCase();
        const sameSeries = entrySeries !== '' && entrySeries === normalizedSeries;
        const entryPlatform = (entry.platform ?? '').toLowerCase();
        const samePlatform = normalizedPlatform === '' || entryPlatform === normalizedPlatform;
        const episodeNameHasValue = typeof entry.episodeName === 'string' && entry.episodeName.trim().length > 0;
        const episodicPattern = /\b(e|episode)\s*\d+/i;
        const titleLooksEpisodic = episodicPattern.test(entry.title ?? '') || episodicPattern.test(entry.originalTitle ?? '');
        const looksEpisodic =
          entry.type === 'episode' ||
          typeof entry.episodeNumber === 'number' ||
          typeof entry.seasonNumber === 'number' ||
          episodeNameHasValue ||
          titleLooksEpisodic;
        if (sameSeries && samePlatform && looksEpisodic) {
          keysToRemove.push(key);
        }
      }
      if (keysToRemove.length > 0) {
        await storage.remove(keysToRemove);
        const updatedTrackedSnapshot = await storage.get('trackedContent');
        const updatedTrackedRaw = updatedTrackedSnapshot.trackedContent;
        const updatedTrackedList = Array.isArray(updatedTrackedRaw)
          ? updatedTrackedRaw.filter((value): value is string => typeof value === 'string')
          : [];
        const filteredTracked = updatedTrackedList.filter((key) => !keysToRemove.includes(key));
        await storage.set({ trackedContent: filteredTracked });
        console.log('[ReWatch Background] Removed duplicate episode entries for series:', seriesTitle);
      }
    }
  }
  console.log('[ReWatch Background] Save complete');
  cleanupOldEntries().catch((error) => {
    console.log('[ReWatch Background] Cleanup skipped:', (error as Error).message);
  });
};

const getProgress = async (url: string | null | undefined): Promise<StoredContentItem | null> => {
  if (!url || typeof url !== 'string') {
    return null;
  }
  const storage = assertChromeStorage();
  const trackedResponse = await storage.get('trackedContent');
  const trackedRaw = trackedResponse.trackedContent;
  const trackedContent = Array.isArray(trackedRaw)
    ? trackedRaw.filter((value): value is string => typeof value === 'string')
    : [];
  let fallbackMatch: StoredContentItem | null = null;
  if (trackedContent.length > 0) {
    const entries = await storage.get(trackedContent);
    for (const key of trackedContent) {
      const entry = entries[key];
      if (!isStoredContentItem(entry)) {
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
  const allEntries = await storage.get(null);
  for (const value of Object.values(allEntries)) {
    if (!isStoredContentItem(value)) {
      continue;
    }
    if (urlsRoughlyMatch(value.url, url)) {
      return value;
    }
  }
  return null;
};

const cleanupOldEntries = async (): Promise<void> => {
  const storage = assertChromeStorage();
  const result = await storage.get(null);
  const entries = { ...result };
  const trackedRaw = entries.trackedContent;
  const trackedContent = Array.isArray(trackedRaw)
    ? trackedRaw.filter((value): value is string => typeof value === 'string')
    : [];
  delete entries.trackedContent;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const keysToRemove: string[] = [];
  for (const [key, value] of Object.entries(entries)) {
    if (!isStoredContentItem(value)) {
      continue;
    }
    if (!value.lastWatched) {
      continue;
    }
    const lastWatchedDate = new Date(value.lastWatched);
    if (Number.isNaN(lastWatchedDate.getTime())) {
      continue;
    }
    if (
      lastWatchedDate < sixMonthsAgo &&
      Number.isFinite(value.percentComplete) &&
      value.percentComplete >= 95
    ) {
      keysToRemove.push(key);
    }
  }
  if (!keysToRemove.length) {
    return;
  }
  await storage.remove(keysToRemove);
  if (trackedContent.length) {
    const filteredTracked = trackedContent.filter((key) => !keysToRemove.includes(key));
    await storage.set({ trackedContent: filteredTracked });
  }
  console.log('[ReWatch Background] Cleaned up old entries:', keysToRemove);
};

if (chromeApi?.runtime?.onMessage) {
  chromeApi.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    console.log('[ReWatch Background] Received message:', request.action, request);
    if (request.action === 'saveProgress') {
      saveProgress(request.data)
        .then(() => {
          console.log('[ReWatch Background] Progress saved successfully');
          sendResponse({ success: true });
        })
        .catch((error: unknown) => {
          console.error('[ReWatch Background] Error saving progress:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }
    if (request.action === 'debugLog') {
      console.log('[ReWatch Background Debug]', request.message, request.data);
      sendResponse({ success: true });
      return true;
    }
    if (request.action === 'getProgress') {
      getProgress(request.url)
        .then((data) => {
          console.log('[ReWatch Background] Progress retrieved:', data);
          sendResponse({ success: true, data });
        })
        .catch((error: unknown) => {
          console.error('[ReWatch Background] Error getting progress:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }
    return false;
  });
}

export {
  cleanupOldEntries,
  generateContentKey,
  getProgress,
  normalizeUrlForComparison,
  saveProgress,
  urlsRoughlyMatch
};
