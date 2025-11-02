import React, { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, type ReWatchSettings } from '@shared/settings';
import {
  ActionButton,
  ActionsRow,
  Card,
  CardHeader,
  CardTitle,
  ContentList,
  DeleteButton,
  DetectorBadge,
  DetectorEmpty,
  DetectorHeader,
  DetectorItem,
  DetectorList,
  DetectorMeta,
  DetectorRefresh,
  DetectorRow,
  DetectorSection,
  DetectorTitle,
  DonateRow,
  EmptyState,
  EpisodeBadge,
  EpisodeName,
  FilterButton,
  FilterRow,
  Footer,
  FooterActions,
  GlobalStyle,
  Header,
  HeaderMeta,
  HeaderSurface,
  InfoBackdrop,
  InfoButton,
  InfoDialog,
  InfoDialogBody,
  InfoDialogCloseButton,
  InfoDialogHeader,
  InfoDialogTitle,
  InfoDomains,
  InfoList,
  InfoListItem,
  InfoPlatform,
  Layout,
  MetaRow,
  Pagination,
  PaginationButton,
  PaginationInfo,
  PlatformLabel,
  ProgressBar,
  ProgressFill,
  SearchInput,
  SearchRow,
  SecondaryButton,
  StatCard,
  StatLabel,
  StatValue,
  Stats,
  Subtitle,
  Title,
  TertiaryButton
} from './styled';

type PlatformInfo = {
  name: string;
  domain: string;
};

const SUPPORTED_PLATFORMS: PlatformInfo[] = [
  { name: 'Netflix', domain: 'https://www.netflix.com' },
  { name: 'Disney+', domain: 'https://www.disneyplus.com' },
  { name: 'HBO Max', domain: 'https://play.hbomax.com' },
  { name: 'HiAnime', domain: 'https://hianime.to' },
  { name: 'Tubi', domain: 'https://tubitv.com' },
  { name: 'Crunchyroll', domain: 'https://www.crunchyroll.com' },
  { name: 'Plex', domain: 'https://app.plex.tv' },
  { name: 'Filmzie', domain: 'https://filmzie.com' },
  { name: 'Brocoflix', domain: 'https://brocoflix.lat' }
];

type ContentType = 'movie' | 'episode';
type FilterOption = 'all' | ContentType;

type TrackedContent = {
  key: string;
  url: string;
  title: string;
  platform: string;
  currentTime: number;
  duration: number;
  percentComplete: number;
  lastWatched: string;
  type: ContentType;
  seriesTitle?: string;
  originalTitle?: string;
  episodeName?: string;
  episodeNumber?: number;
  seasonNumber?: number;
};

type ChromeStorageArea = {
  get: (keys?: string | string[] | Record<string, unknown> | null) => Promise<Record<string, unknown>>;
  remove: (keys: string | string[]) => Promise<void>;
};

type ChromeStorage = {
  local?: ChromeStorageArea;
  onChanged?: {
    addListener: (callback: (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, areaName: string) => void) => void;
    removeListener: (callback: (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, areaName: string) => void) => void;
  };
};

type ChromeTabs = {
  create: (options: { url: string }) => Promise<void> | void;
};

type ChromeDownloads = {
  download: (options: { url: string; filename?: string; saveAs?: boolean }) => Promise<void> | void;
};

type ChromeRuntimeManifest = {
  version?: string;
};

type ChromeRuntime = {
  getManifest?: () => ChromeRuntimeManifest;
};

type ChromeApi = {
  storage?: ChromeStorage;
  tabs?: ChromeTabs;
  downloads?: ChromeDownloads;
  runtime?: ChromeRuntime;
};

declare const chrome: ChromeApi | undefined;

type RuntimeResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
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
  platform: string | null;
  detector: string | null;
  status: DetectorStatusKind;
  url: string | null;
  details?: Record<string, unknown>;
  timestamp: number;
};

type RuntimeBroadcast = {
  action?: string;
  settings?: ReWatchSettings;
};

type ExtendedRuntime = ChromeRuntime & {
  sendMessage?: (message: Record<string, unknown>, responseCallback?: (response?: RuntimeResponse<unknown>) => void) => void;
  lastError?: { message?: string };
  onMessage?: {
    addListener?: (
      callback: (message: RuntimeBroadcast, sender: unknown, sendResponse: (response?: unknown) => void) => void
    ) => void;
    removeListener?: (
      callback: (message: RuntimeBroadcast, sender: unknown, sendResponse: (response?: unknown) => void) => void
    ) => void;
  };
};

const isTrackedRecord = (value: unknown): value is Omit<TrackedContent, 'key'> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.url === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.currentTime === 'number' &&
    typeof candidate.duration === 'number' &&
    typeof candidate.percentComplete === 'number' &&
    typeof candidate.lastWatched === 'string' &&
    (candidate.type === 'movie' || candidate.type === 'episode')
  );
};

const formatTime = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
};

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString();
};

const DETECTOR_STATUS_VALUES: readonly DetectorStatusKind[] = ['detecting', 'detected', 'attached', 'no-video', 'metadata', 'error', 'navigation'];

const DETECTOR_TONE_MAP: Record<DetectorStatusKind, 'success' | 'warn' | 'info' | 'error'> = {
  detecting: 'info',
  detected: 'success',
  attached: 'success',
  'no-video': 'warn',
  metadata: 'info',
  error: 'error',
  navigation: 'info'
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

const normalizeDetectorEntries = (value: unknown): DetectorStatusEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized: DetectorStatusEntry[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const statusRaw = entry.status;
    const timestampRaw = entry.timestamp;
    if (typeof statusRaw !== 'string' || typeof timestampRaw !== 'number' || !Number.isFinite(timestampRaw)) {
      continue;
    }
    if (!DETECTOR_STATUS_VALUES.includes(statusRaw as DetectorStatusKind)) {
      continue;
    }
    const platform = typeof entry.platform === 'string' ? entry.platform : null;
    const detector = typeof entry.detector === 'string' ? entry.detector : null;
    const url = typeof entry.url === 'string' ? entry.url : null;
    const details = isRecord(entry.details) ? (entry.details as Record<string, unknown>) : undefined;
    normalized.push({
      platform,
      detector,
      status: statusRaw as DetectorStatusKind,
      url,
      details,
      timestamp: timestampRaw
    });
  }
  return normalized;
};

const formatStatusLabel = (status: DetectorStatusKind): string =>
  status
    .split('-')
    .map((segment) => (segment.length ? `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1)}` : segment))
    .join(' ');

const formatDetectorTimestamp = (value: number): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60000) {
    return 'Just now';
  }
  if (diffMs < 3600000) {
    const minutes = Math.floor(diffMs / 60000);
    return `${minutes}m ago`;
  }
  if (diffMs < 86400000) {
    const hours = Math.floor(diffMs / 3600000);
    return `${hours}h ago`;
  }
  return date.toLocaleString();
};

const formatDetailValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(error instanceof Error ? error.message : value);
    }
  }
  return String(value);
};

const App = () => {
  const [items, setItems] = useState<TrackedContent[]>([]);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [settings, setSettings] = useState<ReWatchSettings>(DEFAULT_SETTINGS);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [detectorEntries, setDetectorEntries] = useState<DetectorStatusEntry[]>([]);
  const [isDetectorLoading, setIsDetectorLoading] = useState(false);
  const [isDetectorVisible, setIsDetectorVisible] = useState(false);
  const pageSize = 6;
  const hasScrolledRef = useRef(false);
  const version = useMemo(() => {
    if (!chrome?.runtime?.getManifest) {
      return '';
    }
    const manifest = chrome.runtime.getManifest();
    return manifest.version ?? '';
  }, []);

  const callRuntime = useCallback(
    <T,>(message: Record<string, unknown>): Promise<RuntimeResponse<T>> =>
      new Promise((resolve) => {
        const runtime = chrome?.runtime as ExtendedRuntime | undefined;
        if (!runtime?.sendMessage) {
          resolve({ success: false });
          return;
        }
        const handleResponse = (response?: RuntimeResponse<unknown>) => {
          if (runtime.lastError) {
            resolve({ success: false, error: runtime.lastError.message });
            return;
          }
          resolve((response as RuntimeResponse<T>) ?? { success: false });
        };
        try {
          runtime.sendMessage(message, handleResponse);
        } catch (error) {
          resolve({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
      }),
    []
  );

  const loadSettings = useCallback(async () => {
    const response = await callRuntime<ReWatchSettings>({ action: 'getSettings' });
    setSettings((prev) => {
      if (response.success && response.data) {
        return response.data;
      }
      return prev;
    });
  }, [callRuntime]);

  const loadDetectorStatus = useCallback(async () => {
    setIsDetectorLoading(true);
    const response = await callRuntime<DetectorStatusEntry[]>({ action: 'getDetectorStatus' });
    setDetectorEntries((prev) => {
      if (response.success && response.data) {
        return normalizeDetectorEntries(response.data);
      }
      return prev;
    });
    setIsDetectorLoading(false);
  }, [callRuntime]);

  const loadContent = useCallback(async () => {
    if (!chrome?.storage?.local) {
      setItems([]);
      setIsLoading(false);
      return;
    }
    try {
      const result = await chrome.storage.local.get(null);
      const aggregated: TrackedContent[] = [];
      for (const [key, value] of Object.entries(result)) {
        if (!key.startsWith('content_') || !isTrackedRecord(value)) {
          continue;
        }
        aggregated.push({
          key,
          url: value.url,
          title: value.title,
          platform: value.platform ?? '',
          currentTime: value.currentTime,
          duration: value.duration,
          percentComplete: Math.max(0, Math.min(100, value.percentComplete)),
          lastWatched: value.lastWatched,
          type: value.type,
          seriesTitle: value.seriesTitle,
          originalTitle: value.originalTitle,
          episodeName: value.episodeName,
          episodeNumber: value.episodeNumber,
          seasonNumber: value.seasonNumber
        });
      }
      aggregated.sort((a, b) => new Date(b.lastWatched).getTime() - new Date(a.lastWatched).getTime());
      setItems(aggregated);
    } catch (error) {
      console.error('[ReWatch Popup] Failed to load content', error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  useEffect(() => {
    loadSettings();
    loadDetectorStatus();
  }, [loadSettings, loadDetectorStatus]);

  useEffect(() => {
    if (!chrome?.storage?.onChanged) {
      return;
    }
    const listener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, areaName: string) => {
      if (areaName !== 'local') {
        return;
      }
      const keys = Object.keys(changes);
      const contentChanged = keys.some((key) => key === 'trackedContent' || key.startsWith('content_'));
      const settingsChanged = keys.includes('rewatch_settings');
      const detectorChanged = keys.includes('rewatch_detector_status');
      if (contentChanged) {
        loadContent();
      }
      if (settingsChanged) {
        loadSettings();
      }
      if (detectorChanged) {
        loadDetectorStatus();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage?.onChanged?.removeListener(listener);
    };
  }, [loadContent, loadDetectorStatus, loadSettings]);

  useEffect(() => {
    const runtime = chrome?.runtime as ExtendedRuntime | undefined;
    if (!runtime?.onMessage?.addListener) {
      return;
    }
    const handler = (message: RuntimeBroadcast) => {
      if (!message || typeof message !== 'object') {
        return;
      }
      if (message.action === 'settingsUpdated' && message.settings) {
        setSettings(message.settings);
      }
    };
    runtime.onMessage.addListener(handler);
    return () => {
      runtime.onMessage?.removeListener?.(handler);
    };
  }, []);

  const stats = useMemo(() => {
    const totalCount = items.length;
    const inProgressCount = items.filter((item) => item.percentComplete > 5 && item.percentComplete < 95).length;
    return { totalCount, inProgressCount };
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();
    const typeFiltered = filter === 'all' ? items : items.filter((item) => item.type === filter);
    if (!normalizedQuery) {
      return typeFiltered;
    }
    return typeFiltered.filter((item) => {
      const fields = [
        item.title,
        item.seriesTitle,
        item.originalTitle,
        item.episodeName,
        item.platform
      ].filter(Boolean);
      return fields.some((field) => field!.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, items, search]);

  useEffect(() => {
    setPage(0);
  }, [filter, search]);

  const pageCount = useMemo(() => {
    if (filteredItems.length === 0) {
      return 0;
    }
    return Math.ceil(filteredItems.length / pageSize);
  }, [filteredItems, pageSize]);

  useEffect(() => {
    if (pageCount === 0) {
      if (page !== 0) {
        setPage(0);
      }
      return;
    }
    if (page >= pageCount) {
      setPage(pageCount - 1);
    }
  }, [page, pageCount]);

  const currentPageIndex = pageCount === 0 ? 0 : Math.min(page, pageCount - 1);
  const paginatedItems = useMemo(() => {
    if (pageCount === 0) {
      return [] as TrackedContent[];
    }
    const start = currentPageIndex * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [currentPageIndex, filteredItems, pageCount, pageSize]);

  useEffect(() => {
    if (!hasScrolledRef.current) {
      hasScrolledRef.current = true;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPageIndex]);

  const handlePrevPage = () => {
    setPage((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const handleNextPage = () => {
    setPage((prev) => (pageCount === 0 || prev >= pageCount - 1 ? prev : prev + 1));
  };

  const handleFilterChange = (value: FilterOption) => {
    setFilter(value);
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value ?? '');
  };

  const handleOpen = async (url: string) => {
    if (!chrome?.tabs) {
      return;
    }
    try {
      await chrome.tabs.create({ url });
    } catch (error) {
      console.error('[ReWatch Popup] Failed to open tab', error);
    }
  };

  const handleDelete = async (key: string) => {
    if (!chrome?.storage?.local) {
      return;
    }
    if (!window.confirm('Delete this item?')) {
      return;
    }
    try {
      await chrome.storage.local.remove(key);
      loadContent();
    } catch (error) {
      console.error('[ReWatch Popup] Failed to delete item', error);
    }
  };

  const handleClearCompleted = async () => {
    if (!chrome?.storage?.local) {
      return;
    }
    if (!window.confirm('Clear all completed items (95%+)?')) {
      return;
    }
    const completedKeys = items.filter((item) => item.percentComplete >= 95).map((item) => item.key);
    if (!completedKeys.length) {
      return;
    }
    try {
      await chrome.storage.local.remove(completedKeys);
      loadContent();
    } catch (error) {
      console.error('[ReWatch Popup] Failed to clear completed items', error);
    }
  };

  const handleExport = () => {
    const data = JSON.stringify(items, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadsApi = chrome?.downloads;
    if (!downloadsApi || typeof downloadsApi.download !== 'function') {
      URL.revokeObjectURL(url);
      return;
    }
    const maybePromise = downloadsApi.download({
      url,
      filename: `ReWatch-export-${new Date().toISOString().split('T')[0]}.json`,
      saveAs: true
    });
    void Promise.resolve(maybePromise).finally(() => {
      URL.revokeObjectURL(url);
    });
  };

  const handleToggleDebug = useCallback(async () => {
    if (isSettingsSaving) {
      return;
    }
    setIsSettingsSaving(true);
    const nextEnabled = !settings.debugLoggingEnabled;
    const response = await callRuntime<ReWatchSettings>({ action: 'updateSettings', settings: { debugLoggingEnabled: nextEnabled } });
    if (response.success && response.data) {
      setSettings(response.data);
    } else {
      await loadSettings();
    }
    setIsSettingsSaving(false);
  }, [callRuntime, isSettingsSaving, loadSettings, settings.debugLoggingEnabled]);

  const handleDetectorRefresh = useCallback(() => {
    loadDetectorStatus();
  }, [loadDetectorStatus]);

  const handleDetectorToggle = useCallback(() => {
    setIsDetectorVisible((prev) => !prev);
  }, []);

  const handleDonate = () => {
    if (!chrome?.tabs) {
      return;
    }
    chrome.tabs.create({ url: 'https://revolut.me/cristiandust' });
  };

  const handleShare = () => {
    if (!chrome?.tabs) {
      return;
    }
    chrome.tabs.create({
      url: 'https://chromewebstore.google.com/detail/rewatch-streaming-progres/ckbcgcalfceokmjbkcghannbbbklfpij'
    });
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      setShowInfo(false);
    }
  };

  const toggleEnabled = settings.debugLoggingEnabled;
  const hasDetectorEntries = detectorEntries.length > 0;

  return (
    <>
      <GlobalStyle />
      <Layout>
        <HeaderSurface>
          <Header>
            <Title>ReWatch</Title>
            <Subtitle>Your Streaming Progress Tracker</Subtitle>
            {version ? <HeaderMeta>Version {version}</HeaderMeta> : null}
          </Header>
        </HeaderSurface>
        <Stats>
          <StatCard>
            <StatValue>{stats.totalCount}</StatValue>
            <StatLabel>Tracked</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue>{stats.inProgressCount}</StatValue>
            <StatLabel>In Progress</StatLabel>
          </StatCard>
        </Stats>
        <DetectorSection>
          <DetectorHeader>
            <DetectorTitle>Detector Health</DetectorTitle>
            <ActionsRow>
              <DetectorRefresh type="button" onClick={handleDetectorRefresh} disabled={isDetectorLoading}>
                {isDetectorLoading ? 'Refreshing...' : 'Refresh'}
              </DetectorRefresh>
              <DetectorRefresh type="button" onClick={handleDetectorToggle}>
                {isDetectorVisible ? 'Hide' : 'Show'}
              </DetectorRefresh>
            </ActionsRow>
          </DetectorHeader>
          {isDetectorVisible ? (
            isDetectorLoading ? (
              <DetectorEmpty>Collecting detector activity...</DetectorEmpty>
            ) : hasDetectorEntries ? (
              <DetectorList>
                {detectorEntries.map((entry) => {
                  const tone = DETECTOR_TONE_MAP[entry.status];
                  const timestampLabel = formatDetectorTimestamp(entry.timestamp);
                  const detectorLabel = entry.detector ? `Detector: ${entry.detector}` : 'Detector: n/a';
                  const detailEntries = entry.details ? Object.entries(entry.details) : [];
                  return (
                    <DetectorItem key={`${entry.platform ?? 'unknown'}|${entry.detector ?? 'unknown'}|${entry.timestamp}`}>
                      <DetectorRow>
                        <span>{entry.platform ?? 'Unknown platform'}</span>
                        <DetectorBadge $tone={tone}>{formatStatusLabel(entry.status)}</DetectorBadge>
                      </DetectorRow>
                      <DetectorMeta>
                        <span>{detectorLabel}</span>
                        <span>{timestampLabel}</span>
                        {entry.url ? (
                          <a href={entry.url} target="_blank" rel="noopener noreferrer">
                            Open page
                          </a>
                        ) : null}
                      </DetectorMeta>
                      {detailEntries.length ? (
                        <DetectorMeta>
                          {detailEntries.map(([detailKey, detailValue]) => (
                            <span key={detailKey}>{`${detailKey}: ${formatDetailValue(detailValue)}`}</span>
                          ))}
                        </DetectorMeta>
                      ) : null}
                    </DetectorItem>
                  );
                })}
              </DetectorList>
            ) : (
              <DetectorEmpty>No detector activity recorded recently.</DetectorEmpty>
            )
          ) : null}
        </DetectorSection>
        <FilterRow>
          <FilterButton $active={filter === 'all'} onClick={() => handleFilterChange('all')}>
            All
          </FilterButton>
          <FilterButton $active={filter === 'movie'} onClick={() => handleFilterChange('movie')}>
            Movies
          </FilterButton>
          <FilterButton $active={filter === 'episode'} onClick={() => handleFilterChange('episode')}>
            Episodes
          </FilterButton>
        </FilterRow>
        <SearchRow>
          <SearchInput
            placeholder="Filter by title, platform, or episode..."
            value={search}
            onChange={handleSearchChange}
          />
          <InfoButton type="button" onClick={() => setShowInfo(true)}>
            i
          </InfoButton>
        </SearchRow>
        {isLoading ? (
          <EmptyState>Loading your content...</EmptyState>
        ) : filteredItems.length === 0 ? (
          <EmptyState>No tracked content yet. Start watching something on a supported platform.</EmptyState>
        ) : (
          <ContentList>
            {paginatedItems.map((item) => {
              const percent = Math.round(item.percentComplete);
              const baseTitle = item.title || item.seriesTitle || item.originalTitle || 'Untitled';
              const badge = item.type === 'episode'
                ? item.seasonNumber && item.episodeNumber
                  ? `S${item.seasonNumber} E${item.episodeNumber}`
                  : item.seasonNumber
                  ? `Season ${item.seasonNumber}`
                  : item.episodeNumber
                  ? `Ep ${item.episodeNumber}`
                  : ''
                : '';
              return (
                <Card key={item.key}>
                  <CardHeader>
                    <CardTitle>
                      <span>{baseTitle}</span>
                      {item.type === 'episode' && item.episodeName ? (
                        <EpisodeName>– {item.episodeName}</EpisodeName>
                      ) : null}
                      {badge ? <EpisodeBadge>{badge}</EpisodeBadge> : null}
                    </CardTitle>
                    <EpisodeBadge>{item.type}</EpisodeBadge>
                  </CardHeader>
                  <PlatformLabel>{item.platform}</PlatformLabel>
                  <ProgressBar>
                    <ProgressFill $percent={percent} />
                  </ProgressBar>
                  <MetaRow>
                    <span>
                      {formatTime(item.currentTime)} / {formatTime(item.duration)} ({percent}%)
                    </span>
                    <span>{formatDate(item.lastWatched)}</span>
                  </MetaRow>
                  <ActionsRow>
                    <ActionButton onClick={() => handleOpen(item.url)}>Open</ActionButton>
                    <DeleteButton onClick={() => handleDelete(item.key)}>Delete</DeleteButton>
                  </ActionsRow>
                </Card>
              );
            })}
          </ContentList>
        )}
        {filteredItems.length > 0 && pageCount > 1 ? (
          <Pagination>
            <PaginationButton type="button" onClick={handlePrevPage} disabled={currentPageIndex === 0}>
              Previous
            </PaginationButton>
            <PaginationInfo>
              Page {currentPageIndex + 1} of {pageCount}
            </PaginationInfo>
            <PaginationButton
              type="button"
              onClick={handleNextPage}
              disabled={pageCount === 0 || currentPageIndex >= pageCount - 1}
            >
              Next
            </PaginationButton>
          </Pagination>
        ) : null}
        <Footer>
          <FooterActions>
            <SecondaryButton onClick={handleClearCompleted}>Clear Completed</SecondaryButton>
            <SecondaryButton onClick={handleExport}>Export Data</SecondaryButton>
          </FooterActions>
          <FooterActions>
            <SecondaryButton onClick={handleShare}>Share ReWatch</SecondaryButton>
            <SecondaryButton disabled={isSettingsSaving} onClick={handleToggleDebug}>
              {toggleEnabled ? 'Disable Debug' : 'Enable Debug'}
            </SecondaryButton>
          </FooterActions>
          <DonateRow>
            <span>Enjoy ReWatch? Help keep it improving.</span>
            <TertiaryButton onClick={handleDonate}>Donate</TertiaryButton>
          </DonateRow>
        </Footer>
        {showInfo ? (
          <InfoBackdrop onClick={handleBackdropClick}>
            <InfoDialog>
              <InfoDialogHeader>
                <InfoDialogTitle>Supported Platforms</InfoDialogTitle>
                <InfoDialogCloseButton type="button" onClick={() => setShowInfo(false)}>
                  ×
                </InfoDialogCloseButton>
              </InfoDialogHeader>
              <InfoDialogBody>
                <InfoList>
                  {SUPPORTED_PLATFORMS.map((platform) => (
                    <InfoListItem key={platform.name}>
                      <InfoPlatform>{platform.name}</InfoPlatform>
                      <InfoDomains>
                        <a href={platform.domain} target="_blank" rel="noopener noreferrer">
                          {platform.domain}
                        </a>
                      </InfoDomains>
                    </InfoListItem>
                  ))}
                </InfoList>
              </InfoDialogBody>
            </InfoDialog>
          </InfoBackdrop>
        ) : null}
      </Layout>
    </>
  );
};

export default App;
