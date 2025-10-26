(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;

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
      'YouTube',
      'Tubi',
      'Pluto TV',
      'Crunchyroll',
      'The Roku Channel',
      'Plex',
      'Filmzie'
    ]),
    MINIMUM_CLIP_DURATION_SECONDS: 5 * 60
  };

  root.constants = Object.freeze({
    ...root.constants,
    ...constants
  });
})();
