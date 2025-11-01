export type StoredContentType = 'movie' | 'episode';

export type StoredContentItem = {
  url: string;
  title: string;
  currentTime: number;
  duration: number;
  platform?: string;
  type: StoredContentType;
  lastWatched: string;
  percentComplete: number;
  episodeNumber?: number;
  seasonNumber?: number;
  seriesTitle?: string;
  episodeName?: string;
  originalTitle?: string;
};

export const isStoredContentItem = (value: unknown): value is StoredContentItem => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const hasRequiredFields =
    typeof candidate.url === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.currentTime === 'number' &&
    typeof candidate.duration === 'number' &&
    typeof candidate.lastWatched === 'string' &&
    typeof candidate.percentComplete === 'number' &&
    (candidate.type === 'movie' || candidate.type === 'episode');
  return hasRequiredFields;
};
