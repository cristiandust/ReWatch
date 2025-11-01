import type { ReWatchNamespace } from './namespace';

type ReWatchWindow = typeof window & {
  ReWatch?: ReWatchNamespace;
};

const initializeConstants = () => {
  if (typeof window === 'undefined') {
    return;
  }
  const globalWindow = window as ReWatchWindow;
  const root = globalWindow.ReWatch;
  if (!root) {
    return;
  }
  const constants = {
    IGNORED_TITLE_KEYWORDS: Object.freeze([
      'subtitle',
      'sub-title',
      'synopsis',
      'description',
      'dialog',
      'dialogue',
      'caption',
      'transcript',
      'tooltip',
      'preview',
      'upnext',
      'up-next',
      'context-text',
      'trailer'
    ]),
    ALLOWED_TITLE_CONTAINER_KEYWORDS: Object.freeze([
      'title-bug',
      'playback-title',
      'player-title',
      'details-hero',
      'details-title',
      'playback-details'
    ]),
    UP_NEXT_KEYWORDS: Object.freeze([
      'up-next',
      'upnext',
      'up_next',
      'up next',
      'next episode',
      'next up',
      'coming up',
      'watch next',
      'autoplay'
    ]),
    SUPPORTED_PLATFORM_NAMES: Object.freeze([
      'Disney+',
      'HBO Max',
      'HiAnime',
      'Netflix',
      'Tubi',
      'Crunchyroll',
      'Plex',
      'Filmzie'
    ]),
    MINIMUM_CLIP_DURATION_SECONDS: 5 * 60
  } as const;
  root.constants = Object.freeze({
    ...root.constants,
    ...constants
  });
};

initializeConstants();

export type ConstantsMap = ReturnType<typeof Object.freeze>;
