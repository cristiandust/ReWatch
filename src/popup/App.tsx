import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionButton,
  ActionsRow,
  Card,
  CardHeader,
  CardTitle,
  ContentList,
  DeleteButton,
  DonateRow,
  EmptyState,
  EpisodeBadge,
  EpisodeName,
  FilterButton,
  FilterRow,
  Footer,
  FooterActions,
  Header,
  Layout,
  MetaRow,
  PlatformLabel,
  ProgressBar,
  ProgressFill,
  SearchInput,
  SecondaryButton,
  StatCard,
  StatLabel,
  StatValue,
  Stats,
  Subtitle,
  Title,
  TertiaryButton,
  GlobalStyle,
  Pagination,
  PaginationButton,
  PaginationInfo,
  HeaderMeta,
  HeaderSurface
} from './styled';

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

const App = () => {
  const [items, setItems] = useState<TrackedContent[]>([]);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 6;
  const hasScrolledRef = useRef(false);
  const version = useMemo(() => {
    if (!chrome?.runtime?.getManifest) {
      return '';
    }
    const manifest = chrome.runtime.getManifest();
    return manifest.version ?? '';
  }, []);

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
    if (!chrome?.storage?.onChanged) {
      return;
    }
    const listener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, areaName: string) => {
      if (areaName !== 'local') {
        return;
      }
      const relevant = Object.keys(changes).some((key) => key === 'trackedContent' || key.startsWith('content_'));
      if (relevant) {
        loadContent();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage?.onChanged?.removeListener(listener);
    };
  }, [loadContent]);

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
      <SearchInput
        placeholder="Filter by title, platform, or episode..."
        value={search}
        onChange={handleSearchChange}
      />
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
        </FooterActions>
        <DonateRow>
          <span>Enjoy ReWatch? Help keep it improving.</span>
          <TertiaryButton onClick={handleDonate}>Donate</TertiaryButton>
        </DonateRow>
      </Footer>
      </Layout>
    </>
  );
};

export default App;
