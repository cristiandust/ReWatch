(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const dom = root.core.dom;
  const constants = root.constants;

  let cachedTitle = null;
  let titleObserver = null;

  const setCachedTitle = (value) => {
    cachedTitle = value;
  };

  const resetCachedTitle = () => {
    cachedTitle = null;
  };

  const getCachedTitle = () => cachedTitle;

  const getPageTitle = () => {
    if (cachedTitle) {
      console.log('[ReWatch] Using cached title:', cachedTitle);
      return cachedTitle;
    }

    const unwantedTitles = [
      'privacy preference center',
      'cookie preferences',
      'sign in',
      'login',
      'register',
      'home',
      'watch',
      'loading',
      'error',
      'netflix',
      'hbo max',
      'hbo',
      'max',
      'prime video',
      'disney+',
      'hulu'
    ];

    if (window.location.hostname.includes('hbo') || window.location.hostname.includes('max')) {
      const hboShowTitle = document.querySelector('[data-testid="player-ux-asset-title"]');
      if (hboShowTitle && hboShowTitle.textContent.trim()) {
        const showName = hboShowTitle.textContent.trim();
        console.log('[ReWatch] Found HBO Max show name from player UI:', showName);
        cachedTitle = showName;
        return showName;
      }

      const hboShowSelectors = [
        '[class*="Title-Fuse"]',
        '[class*="player"] h1:not(:has(*))',
        '[class*="ContentMetadata"] span:first-child',
        '[class*="PlayerMetadata"] > div:first-child'
      ];

      for (const selector of hboShowSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent) {
          const text = el.textContent.trim();
          if (text && !text.match(/S\s*\d+\s*E\s*\d+/i) && text.length > 2 && text.length < 100) {
            console.log('[ReWatch] Found HBO Max show name:', text);
            cachedTitle = text;
            return text;
          }
        }
      }
    }

    const selectors = [
      'meta[property="og:title"]',
      'meta[name="title"]',
      'meta[property="twitter:title"]',
      '[class*="Metadata"] [class*="Title"]',
      '[class*="metadata"] h1',
      '[class*="VideoMetadata"] h1',
      '[class*="PlayerMetadata"]',
      'button[class*="Title"]',
      '[class*="show-title"]',
      '[class*="series-title"]',
      '[class*="SeriesTitle"]',
      '[class*="ShowTitle"]',
      '[data-testid*="series"]',
      '[data-testid*="show"]',
      '[class*="breadcrumb"] a',
      '[class*="Breadcrumb"] a',
      'a[href*="/series/"]',
      'a[href*="/view/"]',
      '[class*="series"] h1',
      '[class*="series"] h2',
      '[data-uia*="title"]',
      '[data-testid*="title"]',
      '[aria-label*="title"]',
      '[class*="video-title"]',
      '[class*="player-title"]',
      '[class*="VideoTitle"]',
      '[class*="PlayerTitle"]',
      '[class*="film-name"]',
      '[class*="movie-title"]',
      '[class*="anime-title"]',
      '[class*="content-title"]',
      '[class*="media-title"]',
      'h1[class*="title"]:not([class*="episode"])',
      'h2[class*="title"]:not([class*="episode"])',
      'h1[class*="Title"]:not([class*="Episode"])',
      'h2[class*="Title"]:not([class*="Episode"])',
      '.title:not(.episode-title)',
      '.Title:not(.EpisodeTitle)',
      'h1:not([class*="episode"])',
      'h2:not([class*="episode"])',
      '[class*="title"]',
      '[class*="Title"]',
      '[id*="title"]',
      '[id*="Title"]',
      'title'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) {
        continue;
      }

      if (dom.shouldSkipTitleNode(element)) {
        continue;
      }

      const title = element.content || element.textContent;
      if (!title || !title.trim() || title.trim().length >= 200) {
        continue;
      }

      const titleLower = title.trim().toLowerCase();
      if (unwantedTitles.some((unwanted) => titleLower === unwanted || (titleLower.includes(unwanted) && title.trim().length < 15))) {
        console.log('[ReWatch] Skipping generic title:', title.trim());
        continue;
      }

      let cleanTitle = title.trim()
        .replace(/[\u2068\u2069\u202A-\u202E]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
        .replace(/([0-9])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .replace(/\s*[•\-|:]\s*(HBO\s*Max?|Max|Netflix|Prime\s*Video|Disney\+?|Hulu).*$/i, '')
        .replace(/^Watch\s+/i, '')
        .replace(/^Now\s+Playing:?\s*/i, '')
        .replace(/\s*[-|]\s*Official\s+(Site|Website)/i, '')
        .replace(/\s+English\s+(Sub|Dub|Subtitles?|Audio).*$/i, '')
        .replace(/\s+\((Sub|Dub|Subtitles?)\)$/i, '')
        .replace(/\s*[-|]\s*Stream(ing)?\s+(Now|Online|Free)?$/i, '')
        .replace(/\s*[-|]\s*Full\s+(Episode|Movie|HD).*$/i, '')
        .trim();

      const normalizedCleanTitle = cleanTitle.toLowerCase();
      const containsCookieBanner = (
        normalizedCleanTitle.includes('cookie preference center') ||
        normalizedCleanTitle.includes('cookie preferences') ||
        normalizedCleanTitle.includes('privacy preference center')
      );

      if (containsCookieBanner) {
        console.log('[ReWatch] Skipping cookie banner title:', cleanTitle);
        continue;
      }

      const isGenericDisneyTitle = normalizedCleanTitle.startsWith('disney+') && (
        normalizedCleanTitle === 'disney+' ||
        /disney\+\s*[|•-]\s*(movies?\s+and\s+shows|home|watch|official|originals?|series|tv\s+shows)/i.test(cleanTitle)
      );

      if (isGenericDisneyTitle) {
        console.log('[ReWatch] Skipping generic Disney+ title:', cleanTitle);
        continue;
      }

      const isControlLabelTitle = normalizedCleanTitle === 'audio'
        || normalizedCleanTitle === 'audio and subtitles'
        || normalizedCleanTitle === 'audio & subtitles'
        || normalizedCleanTitle === 'subtitles'
        || normalizedCleanTitle === 'settings';

      if (isControlLabelTitle) {
        console.log('[ReWatch] Skipping control label title:', cleanTitle);
        continue;
      }

      console.log('[ReWatch] Found title:', cleanTitle, 'from selector:', selector);
      cachedTitle = cleanTitle;
      return cleanTitle;
    }

    let fallback = document.title;
    console.log('[ReWatch] Raw document.title:', fallback);

    const bulletMatch = fallback && fallback.match(/[•|]\s*([^•|\-]+)/);
    if (bulletMatch && bulletMatch[1].trim().length > 2) {
      fallback = bulletMatch[1].trim();
      fallback = fallback.replace(/\s*[-|•]\s*(HBO\s*Max?|Max|Netflix|Prime|Hulu|Disney\+?)$/i, '').trim();
      console.log('[ReWatch] Extracted show name after bullet/pipe:', fallback);
    } else if (fallback && fallback.match(/:\s*S\d+\s*E\d+/i)) {
      const showMatch = fallback.match(/^([^:]+):/);
      if (showMatch) {
        fallback = showMatch[1].trim();
        console.log('[ReWatch] Extracted show name before S#E#:', fallback);
      }
    } else if (fallback) {
      const dashMatch = fallback.match(/^([^-]+)\s*-\s*[^-]+$/);
      if (dashMatch && !dashMatch[1].match(/HBO|Max|Netflix|Prime|Hulu/i)) {
        fallback = dashMatch[1].trim();
        console.log('[ReWatch] Extracted show name before dash:', fallback);
      }
    }

    if (!fallback || fallback.toLowerCase() === 'netflix' || fallback.toLowerCase() === 'hbo max' || fallback.toLowerCase() === 'max' || fallback.trim().length < 2) {
      console.log('[ReWatch] Document title is generic, trying alternative methods');

      const headings = document.querySelectorAll('h1, h2, h3, strong, b, a[href*="/series/"]');
      for (const heading of headings) {
        const text = heading.textContent.trim();
        if (text.length > 3 && text.length < 100 && !unwantedTitles.some((unwanted) => text.toLowerCase() === unwanted)) {
          console.log('[ReWatch] Found alternative title from heading:', text);
          cachedTitle = text;
          return text;
        }
      }

      return fallback && (fallback.includes('max') || fallback.includes('hbo')) ? 'HBO Max Content' : 'Netflix Content';
    }

    fallback = fallback
      .replace(/\s*[-|]\s*(HBO\s*Max?|Max|HiAnime|Netflix|Watch\s+on\s+Netflix|Prime\s+Video|Disney\+)$/i, '')
      .replace(/^Watch\s+/i, '');

    const fallbackLower = fallback.toLowerCase();
    if (unwantedTitles.some((unwanted) => fallbackLower === unwanted)) {
      console.log('[ReWatch] Fallback title is generic:', fallback);
      return 'Netflix Content';
    }

    console.log('[ReWatch] Using fallback title:', fallback);
    cachedTitle = fallback;
    return fallback || 'Unknown Title';
  };

  const getTitleObserver = () => titleObserver;
  const setTitleObserver = (observer) => {
    titleObserver = observer;
  };

  root.core.title = Object.freeze({
    getPageTitle,
    getCachedTitle,
    setCachedTitle,
    resetCachedTitle,
    getTitleObserver,
    setTitleObserver
  });
})();
