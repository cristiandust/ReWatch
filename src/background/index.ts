import { StoredContentItem, StoredContentType, isStoredContentItem } from '@shared/content';
import { DEFAULT_SETTINGS, ReWatchSettings } from '@shared/settings';

const SETTINGS_KEY = 'rewatch_settings';
const DETECTOR_STATUS_KEY = 'rewatch_detector_status';
const MAX_DETECTOR_ENTRIES = 200;

const originalConsoleLog = console.log.bind(console);

let settingsCache: ReWatchSettings = DEFAULT_SETTINGS;
let settingsLoadPromise: Promise<void> | null = null;

const getDebugLoggingEnabled = () => settingsCache.debugLoggingEnabled;

const isPlainRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

const parseSettings = (value: unknown): ReWatchSettings | null => {
  if (!isPlainRecord(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const debugLoggingEnabled = typeof candidate.debugLoggingEnabled === 'boolean' ? candidate.debugLoggingEnabled : DEFAULT_SETTINGS.debugLoggingEnabled;
  const retentionRaw = candidate.detectorTelemetryRetentionHours;
  const heartbeatRaw = candidate.detectorHeartbeatSeconds;
  const retention = typeof retentionRaw === 'number' && Number.isFinite(retentionRaw) ? Math.max(1, Math.floor(retentionRaw)) : DEFAULT_SETTINGS.detectorTelemetryRetentionHours;
  const heartbeat = typeof heartbeatRaw === 'number' && Number.isFinite(heartbeatRaw) ? Math.max(30, Math.floor(heartbeatRaw)) : DEFAULT_SETTINGS.detectorHeartbeatSeconds;
  return {
    debugLoggingEnabled,
    detectorTelemetryRetentionHours: retention,
    detectorHeartbeatSeconds: heartbeat
  };
};

const ensureSettingsLoaded = async (): Promise<void> => {
  if (!settingsLoadPromise) {
    settingsLoadPromise = (async () => {
      try {
        const storage = assertChromeStorage();
        const result = await storage.get(SETTINGS_KEY);
        const parsed = parseSettings(result[SETTINGS_KEY]);
        if (parsed) {
          settingsCache = parsed;
        }
      } catch (error) {
        originalConsoleLog('[ReWatch Background] Failed to load settings:', error);
      }
    })();
  }
  await settingsLoadPromise;
};

const sanitizeSettingsUpdate = (update: Partial<ReWatchSettings>): ReWatchSettings => {
  const debugLoggingEnabled = typeof update.debugLoggingEnabled === 'boolean' ? update.debugLoggingEnabled : settingsCache.debugLoggingEnabled;
  const retentionRaw = update.detectorTelemetryRetentionHours;
  const heartbeatRaw = update.detectorHeartbeatSeconds;
  const retention = typeof retentionRaw === 'number' && Number.isFinite(retentionRaw) ? Math.max(1, Math.floor(retentionRaw)) : settingsCache.detectorTelemetryRetentionHours;
  const heartbeat = typeof heartbeatRaw === 'number' && Number.isFinite(heartbeatRaw) ? Math.max(30, Math.floor(heartbeatRaw)) : settingsCache.detectorHeartbeatSeconds;
  return {
    debugLoggingEnabled,
    detectorTelemetryRetentionHours: retention,
    detectorHeartbeatSeconds: heartbeat
  };
};

const persistSettings = async (next: ReWatchSettings): Promise<void> => {
  const storage = assertChromeStorage();
  await storage.set({ [SETTINGS_KEY]: next });
  settingsCache = next;
};

console.log = (...args: unknown[]) => {
  if (
    getDebugLoggingEnabled() ||
    args.length === 0 ||
    typeof args[0] !== 'string' ||
    !args[0].startsWith('[ReWatch')
  ) {
    originalConsoleLog(...args);
  }
};

void ensureSettingsLoaded();

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

type DetectorStatusKind =
  | 'detecting'
  | 'detected'
  | 'attached'
  | 'no-video'
  | 'metadata'
  | 'error'
  | 'navigation';

type DetectorStatusEntry = {
  platform?: string | null;
  detector?: string | null;
  status: DetectorStatusKind;
  url?: string | null;
  details?: Record<string, unknown>;
  timestamp: number;
};

type DetectorStatusPayload = Omit<DetectorStatusEntry, 'timestamp'> & {
  timestamp?: number;
};

const DETECTOR_STATUS_VALUES: readonly DetectorStatusKind[] = ['detecting', 'detected', 'attached', 'no-video', 'metadata', 'error', 'navigation'];

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
    }
  | {
      action: 'getSettings';
    }
  | {
      action: 'updateSettings';
      settings: Partial<ReWatchSettings>;
    }
  | {
      action: 'detectorStatus';
      status: DetectorStatusPayload;
    }
  | {
      action: 'getDetectorStatus';
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
  sendMessage?: (message: { action: string; [key: string]: unknown }) => void;
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

const normalizeNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeDetails = (value: unknown): Record<string, unknown> | undefined => {
  if (isPlainRecord(value)) {
    return value;
  }
  return undefined;
};

const isDetectorStatusEntry = (value: unknown): value is DetectorStatusEntry => {
  if (!isPlainRecord(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const status = candidate.status;
  const timestamp = candidate.timestamp;
  if (typeof status !== 'string' || !DETECTOR_STATUS_VALUES.includes(status as DetectorStatusKind)) {
    return false;
  }
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return false;
  }
  const platform = candidate.platform;
  const detector = candidate.detector;
  const url = candidate.url;
  const details = candidate.details;
  if (platform !== undefined && platform !== null && typeof platform !== 'string') {
    return false;
  }
  if (detector !== undefined && detector !== null && typeof detector !== 'string') {
    return false;
  }
  if (url !== undefined && url !== null && typeof url !== 'string') {
    return false;
  }
  if (details !== undefined && !isPlainRecord(details)) {
    return false;
  }
  return true;
};

const readDetectorEntries = (value: unknown): DetectorStatusEntry[] => {
  if (Array.isArray(value)) {
    return value.filter(isDetectorStatusEntry);
  }
  if (isDetectorStatusEntry(value)) {
    return [value];
  }
  return [];
};

const detectorKey = (platform: string | null | undefined, detector: string | null | undefined): string => {
  const normalizedPlatform = typeof platform === 'string' ? platform.trim().toLowerCase() : '';
  const normalizedDetector = typeof detector === 'string' ? detector.trim().toLowerCase() : '';
  return `${normalizedPlatform}|${normalizedDetector}`;
};

const pruneDetectorEntries = (entries: DetectorStatusEntry[], retentionHours: number): DetectorStatusEntry[] => {
  const retention = Math.max(1, retentionHours);
  const cutoff = Date.now() - retention * 3600000;
  return entries.filter((entry) => entry.timestamp >= cutoff);
};

const mergeDetectorEntry = (entries: DetectorStatusEntry[], entry: DetectorStatusEntry): DetectorStatusEntry[] => {
  const key = detectorKey(entry.platform, entry.detector);
  const filtered = entries.filter((existing) => detectorKey(existing.platform, existing.detector) !== key);
  return [...filtered, entry];
};

const storeDetectorStatus = async (payload: DetectorStatusPayload): Promise<void> => {
  const statusValue = typeof payload.status === 'string' && DETECTOR_STATUS_VALUES.includes(payload.status as DetectorStatusKind)
    ? (payload.status as DetectorStatusKind)
    : 'detecting';
  const entry: DetectorStatusEntry = {
    platform: payload.platform === null ? null : normalizeNullableString(payload.platform),
    detector: payload.detector === null ? null : normalizeNullableString(payload.detector),
    status: statusValue,
    url: payload.url === null ? null : normalizeNullableString(payload.url),
    details: normalizeDetails(payload.details),
    timestamp: typeof payload.timestamp === 'number' && Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now()
  };
  const storage = assertChromeStorage();
  const existingResult = await storage.get(DETECTOR_STATUS_KEY);
  const existingEntries = readDetectorEntries(existingResult[DETECTOR_STATUS_KEY]);
  const pruned = pruneDetectorEntries(existingEntries, settingsCache.detectorTelemetryRetentionHours);
  const merged = mergeDetectorEntry(pruned, entry);
  const capped = merged.length > MAX_DETECTOR_ENTRIES ? merged.slice(-MAX_DETECTOR_ENTRIES) : merged;
  await storage.set({ [DETECTOR_STATUS_KEY]: capped });
};

const getDetectorStatusEntries = async (): Promise<DetectorStatusEntry[]> => {
  const storage = assertChromeStorage();
  const result = await storage.get(DETECTOR_STATUS_KEY);
  const entries = readDetectorEntries(result[DETECTOR_STATUS_KEY]);
  const pruned = pruneDetectorEntries(entries, settingsCache.detectorTelemetryRetentionHours);
  const capped = pruned.length > MAX_DETECTOR_ENTRIES ? pruned.slice(-MAX_DETECTOR_ENTRIES) : pruned;
  if (capped.length !== entries.length) {
    await storage.set({ [DETECTOR_STATUS_KEY]: capped });
  }
  return [...capped].sort((a, b) => b.timestamp - a.timestamp);
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
    if (request.action === 'getSettings') {
      ensureSettingsLoaded()
        .then(() => {
          sendResponse({ success: true, data: { ...settingsCache } });
        })
        .catch((error: unknown) => {
          console.error('[ReWatch Background] Error loading settings:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }
    if (request.action === 'updateSettings') {
      ensureSettingsLoaded()
        .then(async () => {
          const next = sanitizeSettingsUpdate(request.settings);
          await persistSettings(next);
          try {
            chromeApi?.runtime?.sendMessage?.({ action: 'settingsUpdated', settings: next });
          } catch (error) {
            originalConsoleLog('[ReWatch Background] Broadcast settings update failed:', error);
          }
          sendResponse({ success: true, data: { ...settingsCache } });
        })
        .catch((error: unknown) => {
          console.error('[ReWatch Background] Error updating settings:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }
    if (request.action === 'detectorStatus') {
      ensureSettingsLoaded()
        .then(async () => {
          await storeDetectorStatus(request.status);
          sendResponse({ success: true });
        })
        .catch((error: unknown) => {
          console.error('[ReWatch Background] Error storing detector status:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }
    if (request.action === 'getDetectorStatus') {
      ensureSettingsLoaded()
        .then(async () => {
          const entries = await getDetectorStatusEntries();
          sendResponse({ success: true, data: entries });
        })
        .catch((error: unknown) => {
          console.error('[ReWatch Background] Error retrieving detector status:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        });
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
