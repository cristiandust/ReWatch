// Content script for dynamic video detection and tracking

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

// For iframes: Listen for parent URL, title, and episode number from main page
if (window.self !== window.top) {
  // Request parent info via postMessage
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ReWatch_PARENT_INFO') {
      window.ReWatchParentUrl = event.data.url;
      window.ReWatchParentTitle = event.data.title;
      window.ReWatchParentEpisode = event.data.episodeNumber;
      window.ReWatchParentSeason = event.data.seasonNumber;
      console.log('[ReWatch] Received parent info:', { 
        url: event.data.url, 
        title: event.data.title,
        episodeNumber: event.data.episodeNumber,
        seasonNumber: event.data.seasonNumber
      });
    }
  });
  
  // Request the parent URL, title, and episode number
  try {
    window.parent.postMessage({ type: 'ReWatch_REQUEST_INFO' }, '*');
  } catch (e) {
    console.log('[ReWatch] Could not request parent info:', e.message);
  }
}

// Global variables for title caching (accessible by both parent page and VideoTracker)
let cachedTitle = null;
let titleObserver = null;

const IGNORED_TITLE_KEYWORDS = Object.freeze([
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
]);

const ALLOWED_TITLE_CONTAINER_KEYWORDS = Object.freeze([
  'title-bug',
  'playback-title',
  'player-title',
  'details-hero',
  'details-title',
  'playback-details'
]);

const MINIMUM_CLIP_DURATION_SECONDS = 5 * 60;

const isWithinAllowedTitleContainer = (node) => {
  let current = node;

  while (current) {
    if (current.nodeType !== Node.ELEMENT_NODE) {
      break;
    }

    if (current.id) {
      const id = current.id.toLowerCase();
      if (ALLOWED_TITLE_CONTAINER_KEYWORDS.some((keyword) => id.includes(keyword))) {
        return true;
      }
    }

    if (current.classList && current.classList.length) {
      for (const cls of current.classList) {
        if (cls && ALLOWED_TITLE_CONTAINER_KEYWORDS.some((keyword) => cls.toLowerCase().includes(keyword))) {
          return true;
        }
      }
    }

    if (typeof current.getAttribute === 'function') {
      const dataTestId = current.getAttribute('data-testid');
      if (dataTestId && ALLOWED_TITLE_CONTAINER_KEYWORDS.some((keyword) => dataTestId.toLowerCase().includes(keyword))) {
        return true;
      }
    }

    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }

    if (typeof current.getRootNode === 'function') {
      const root = current.getRootNode();
      if (root && root.host && root !== current) {
        current = root.host;
        continue;
      }
    }

    break;
  }

  if (typeof node.textContent === 'string') {
    const textContent = node.textContent.toLowerCase();
    if (textContent.includes('up next') || textContent.includes('next episode')) {
      return true;
    }
  }

  return false;
};

const shouldSkipTitleNode = (node) => {
  if (!node) {
    return false;
  }

  let current = node;

  if (isWithinAllowedTitleContainer(node)) {
    return false;
  }

  while (current) {
    if (current.nodeType !== Node.ELEMENT_NODE) {
      break;
    }

    if (current.id) {
      const id = current.id.toLowerCase();
      if (IGNORED_TITLE_KEYWORDS.some((keyword) => id.includes(keyword))) {
        return true;
      }
    }

    if (current.classList && current.classList.length) {
      for (const cls of current.classList) {
        if (cls && IGNORED_TITLE_KEYWORDS.some((keyword) => cls.toLowerCase().includes(keyword))) {
          return true;
        }
      }
    }

    if (typeof current.getAttribute === 'function') {
      const dataTestId = current.getAttribute('data-testid');
      if (dataTestId && IGNORED_TITLE_KEYWORDS.some((keyword) => dataTestId.toLowerCase().includes(keyword))) {
        return true;
      }

      const ariaLabel = current.getAttribute('aria-label');
      if (ariaLabel && IGNORED_TITLE_KEYWORDS.some((keyword) => ariaLabel.toLowerCase().includes(keyword))) {
        return true;
      }
    }

    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }

    if (typeof current.getRootNode === 'function') {
      const root = current.getRootNode();
      if (root && root.host && root !== current) {
        current = root.host;
        continue;
      }
    }

    break;
  }

  return false;
};

const getElementNode = (node) => {
  if (!node) {
    return null;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    return node;
  }

  if (node.parentElement) {
    return node.parentElement;
  }

  if (typeof node.getRootNode === 'function') {
    const root = node.getRootNode();
    if (root && root.host) {
      return root.host;
    }
  }

  return null;
};

const isNodeVisible = (node) => {
  let current = getElementNode(node);

  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      if (current.hasAttribute('hidden')) {
        return false;
      }

      const ariaHidden = current.getAttribute && current.getAttribute('aria-hidden');
      if (ariaHidden && ariaHidden.toLowerCase() === 'true') {
        return false;
      }

      try {
        const style = window.getComputedStyle(current);
        if (
          !style ||
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse' ||
          parseFloat(style.opacity || '1') === 0
        ) {
          return false;
        }
      } catch (error) {
        console.log('[ReWatch] Failed to compute style for visibility check:', error.message);
      }
    }

    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }

    if (typeof current.getRootNode === 'function') {
      const root = current.getRootNode();
      if (root && root.host && root !== current) {
        current = root.host;
        continue;
      }
    }

    break;
  }

  return true;
};

const UP_NEXT_KEYWORDS = Object.freeze([
  'up-next',
  'upnext',
  'up_next',
  'up next',
  'next episode',
  'next up',
  'coming up',
  'watch next',
  'autoplay'
]);

const isNodeInUpNextSection = (node) => {
  let current = getElementNode(node);

  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current;

      if (element.classList && element.classList.length) {
        for (const cls of element.classList) {
          if (cls && UP_NEXT_KEYWORDS.some((keyword) => cls.toLowerCase().includes(keyword))) {
            return true;
          }
        }
      }

      if (element.id) {
        const id = String(element.id).toLowerCase();
        if (UP_NEXT_KEYWORDS.some((keyword) => id.includes(keyword))) {
          return true;
        }
      }

      if (typeof element.getAttribute === 'function') {
        const dataTestId = element.getAttribute('data-testid');
        if (dataTestId && UP_NEXT_KEYWORDS.some((keyword) => dataTestId.toLowerCase().includes(keyword))) {
          return true;
        }

        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel && UP_NEXT_KEYWORDS.some((keyword) => ariaLabel.toLowerCase().includes(keyword))) {
          return true;
        }
      }

      if (element !== node) {
        const textContent = (element.textContent || '').toLowerCase();
        if (textContent && UP_NEXT_KEYWORDS.some((keyword) => textContent.includes(keyword))) {
          return true;
        }
      }
    }

    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }

    if (typeof current.getRootNode === 'function') {
      const root = current.getRootNode();
      if (root && root.host && root !== current) {
        current = root.host;
        continue;
      }
    }

    break;
  }

  return false;
};

const SUPPORTED_PLATFORM_NAMES = Object.freeze([
  'Disney+',
  'HBO Max',
  'HiAnime',
  'Netflix'
]);

const findAllVideoElements = () => {
  const videos = new Set();
  const visitedRoots = new Set();

  const processRoot = (root) => {
    if (!root || visitedRoots.has(root) || typeof root.querySelectorAll !== 'function') {
      return;
    }

    visitedRoots.add(root);

    try {
      root.querySelectorAll('video').forEach((video) => {
        videos.add(video);
      });
    } catch (error) {
      console.log('[ReWatch] Unable to query videos from root:', error.message);
      return;
    }

    try {
      root.querySelectorAll('*').forEach((element) => {
        const shadow = element.shadowRoot;
        if (shadow && !visitedRoots.has(shadow)) {
          processRoot(shadow);
        }
      });
    } catch (error) {
      console.log('[ReWatch] Unable to traverse root descendants:', error.message);
    }
  };

  processRoot(document);

  return Array.from(videos);
};

const findAcrossAllRoots = (selectors, handler) => {
  if (!Array.isArray(selectors)) {
    selectors = [selectors].filter(Boolean);
  }

  if (!selectors.length || typeof handler !== 'function') {
    return null;
  }

  const visitedRoots = new Set();
  const queue = [document];

  while (queue.length) {
    const root = queue.shift();
    if (!root || visitedRoots.has(root) || typeof root.querySelectorAll !== 'function') {
      continue;
    }

    visitedRoots.add(root);

    for (const selector of selectors) {
      if (typeof selector !== 'string' || !selector.trim()) {
        continue;
      }

      let nodes;
      try {
        nodes = root.querySelectorAll(selector);
      } catch (error) {
        console.log('[ReWatch] Unable to query selector during deep search:', selector, error.message);
        continue;
      }

      for (const node of nodes) {
        try {
          const result = handler(node, root);
          if (result) {
            return result;
          }
        } catch (error) {
          console.log('[ReWatch] Error evaluating deep search node:', error.message);
        }
      }
    }

    try {
      root.querySelectorAll('*').forEach((element) => {
        const shadow = element && element.shadowRoot;
        if (shadow && !visitedRoots.has(shadow)) {
          queue.push(shadow);
        }
      });
    } catch (error) {
      console.log('[ReWatch] Unable to traverse descendants during deep search:', error.message);
    }
  }

  return null;
};

// Global function to extract page title (works for both iframes and main pages)
const getPageTitle = () => {
  // Return cached title if we have it
  if (cachedTitle) {
    console.log('[ReWatch] Using cached title:', cachedTitle);
    return cachedTitle;
  }
  
  // List of generic/unwanted titles to skip
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
    'netflix',      // Skip if it's just "Netflix"
    'hbo max',      // Skip if it's just "HBO Max"
    'hbo',
    'max',
    'prime video',
    'disney+',
    'hulu'
  ];
  
  // HBO Max specific: Try to get show name from video player area
  // HBO Max shows "Rick and Morty" and "S8 E8: Nomortland" in the video player
  if (window.location.hostname.includes('hbo') || window.location.hostname.includes('max')) {
    // HBO Max has specific data-testid attributes for the show title
    const hboShowTitle = document.querySelector('[data-testid="player-ux-asset-title"]');
    if (hboShowTitle && hboShowTitle.textContent.trim()) {
      const showName = hboShowTitle.textContent.trim();
      console.log('[ReWatch] Found HBO Max show name from player UI:', showName);
      cachedTitle = showName;
      return showName;
    }
    
    // Fallback: Look for other HBO Max player elements
    const hboShowSelectors = [
      '[class*="Title-Fuse"]',  // HBO uses Title-Fuse class
      '[class*="player"] h1:not(:has(*))',  // Top-level h1 in player area
      '[class*="ContentMetadata"] span:first-child',
      '[class*="PlayerMetadata"] > div:first-child'
    ];
    
    for (const selector of hboShowSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent) {
        const text = el.textContent.trim();
        // Make sure this is the show name, not the episode title with S#E#
        if (text && !text.match(/S\s*\d+\s*E\s*\d+/i) && text.length > 2 && text.length < 100) {
          console.log('[ReWatch] Found HBO Max show name:', text);
          cachedTitle = text;
          return text;
        }
      }
    }
  }
  
  // Try universal selectors that work across all platforms
  // Order matters: more specific/reliable selectors first
  const selectors = [
    // Open Graph and meta tags (most reliable - usually show name)
    'meta[property="og:title"]',
    'meta[name="title"]',
    'meta[property="twitter:title"]',
    
    // HBO Max specific selectors (try first for this platform)
    '[class*="Metadata"] [class*="Title"]',
    '[class*="metadata"] h1',
    '[class*="VideoMetadata"] h1',
    '[class*="PlayerMetadata"]',
    'button[class*="Title"]',           // HBO sometimes uses button for title
    
    // Show/Series title (prefer over episode titles)
    '[class*="show-title"]',
    '[class*="series-title"]',
    '[class*="SeriesTitle"]',
    '[class*="ShowTitle"]',
    '[data-testid*="series"]',
    '[data-testid*="show"]',
    
    // HBO Max specific - prefer breadcrumbs/series info
    '[class*="breadcrumb"] a',       // Often has show name
    '[class*="Breadcrumb"] a',
    'a[href*="/series/"]',           // Series links often have show name
    'a[href*="/view/"]',             // HBO Max series links
    '[class*="series"] h1',
    '[class*="series"] h2',
    
    // Common video player title areas
    '[data-uia*="title"]',           // Netflix, others
    '[data-testid*="title"]',        // Many modern sites
    '[aria-label*="title"]',
    '[class*="video-title"]',
    '[class*="player-title"]',
    '[class*="VideoTitle"]',
    '[class*="PlayerTitle"]',
    
    // Content metadata areas
    '[class*="film-name"]',          // HiAnime, anime sites
    '[class*="movie-title"]',
    '[class*="anime-title"]',
    '[class*="content-title"]',
    '[class*="media-title"]',
    
    // Common heading patterns (but check for episode vs show)
    'h1[class*="title"]:not([class*="episode"])',
    'h2[class*="title"]:not([class*="episode"])',
    'h1[class*="Title"]:not([class*="Episode"])',
    'h2[class*="Title"]:not([class*="Episode"])',
    
    // Specific element types that often contain titles
    '.title:not(.episode-title)',
    '.Title:not(.EpisodeTitle)',
    'h1:not([class*="episode"])',
    'h2:not([class*="episode"])',
    
    // Broader searches (less specific)
    '[class*="title"]',
    '[class*="Title"]',
    '[id*="title"]',
    '[id*="Title"]',
    
    // Last resort
    'title'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      if (shouldSkipTitleNode(element)) {
        continue;
      }

      const title = element.content || element.textContent;
      if (title && title.trim().length > 0 && title.trim().length < 200) {
        const titleLower = title.trim().toLowerCase();
        
        // Skip unwanted generic titles
        if (unwantedTitles.some(unwanted => titleLower === unwanted || (titleLower.includes(unwanted) && title.trim().length < 15))) {
          console.log('[ReWatch] Skipping generic title:', title.trim());
          continue;
        }
        
        // Clean up the title - make it universal
        let cleanTitle = title.trim()
          // Remove invisible Unicode formatting characters (HBO Max uses these)
          .replace(/[\u2068\u2069\u202A-\u202E]/g, '')  // Remove directional formatting marks
          // Normalize whitespace
          .replace(/\s+/g, ' ')
          // Add spaces before capital letters (for titles without spaces)
          .replace(/([a-z])([A-Z])/g, '$1 $2')      // "BlackClover" → "Black Clover"
          .replace(/([a-zA-Z])([0-9])/g, '$1 $2')   // "E26" → "E 26"
          .replace(/([0-9])([A-Z])/g, '$1 $2')      // "26Wounded" → "26 Wounded"
          .replace(/\s+/g, ' ')                     // Clean up double spaces
          // Remove platform suffixes with various separators
          .replace(/\s*[•\-|:]\s*(HBO\s*Max?|Max|Netflix|Prime\s*Video|Disney\+?|Hulu|Amazon).*$/i, '')  // Remove "• HBO Max", "- Netflix", etc.
          .replace(/^Watch\s+/i, '')                 // "Watch Show" → "Show"
          .replace(/^Now\s+Playing:?\s*/i, '')       // "Now Playing: Show" → "Show"
          .replace(/\s*[-|]\s*Official\s+(Site|Website)/i, '')
          // Remove common language/subtitle indicators at the end
          .replace(/\s+English\s+(Sub|Dub|Subtitles?|Audio).*$/i, '')
          .replace(/\s+\((Sub|Dub|Subtitles?)\)$/i, '')
          // Remove streaming-related terms
          .replace(/\s*[-|]\s*Stream(ing)?\s+(Now|Online|Free)?$/i, '')
          .replace(/\s*[-|]\s*Full\s+(Episode|Movie|HD).*$/i, '')
          // Final cleanup
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
    }
  }
  
  // Fallback to document title with cleanup and parsing
  let fallback = document.title;
  console.log('[ReWatch] Raw document.title:', fallback);
  
  // HBO Max and others often format as: "Episode Name • Show Name" or "Show Name: Episode Name"
  // Try to extract show name intelligently
  
  // Pattern 1: "Episode Name • Show Name" (HBO Max uses bullet •) or "Episode Name | Show Name"
  let bulletMatch = fallback.match(/[•|]\s*([^•|\-]+)/);
  if (bulletMatch && bulletMatch[1].trim().length > 2) {
    fallback = bulletMatch[1].trim();
    // Remove any trailing platform names
    fallback = fallback.replace(/\s*[-|•]\s*(HBO\s*Max?|Max|Netflix|Prime|Hulu|Disney\+?)$/i, '').trim();
    console.log('[ReWatch] Extracted show name after bullet/pipe:', fallback);
  }
  // Pattern 2: "Show Name: S#E#: Episode Name" - take first part
  else if (fallback.match(/:\s*S\d+\s*E\d+/i)) {
    const showMatch = fallback.match(/^([^:]+):/);
    if (showMatch) {
      fallback = showMatch[1].trim();
      console.log('[ReWatch] Extracted show name before S#E#:', fallback);
    }
  }
  // Pattern 3: "Show Name - Episode Name" - take first part (but be careful)
  else {
    const dashMatch = fallback.match(/^([^-]+)\s*-\s*[^-]+$/);
    if (dashMatch && !dashMatch[1].match(/HBO|Max|Netflix|Prime|Hulu/i)) {
      // Only use this if the first part doesn't look like a platform name
      fallback = dashMatch[1].trim();
      console.log('[ReWatch] Extracted show name before dash:', fallback);
    }
  }
  
  // Netflix/generic platform handling
  if (fallback.toLowerCase() === 'netflix' || fallback.toLowerCase() === 'hbo max' || fallback.toLowerCase() === 'max' || fallback.trim().length < 2) {
    // Last resort: Try to parse from URL or wait for page to load
    console.log('[ReWatch] Document title is generic, trying alternative methods');
    
    // Try looking for any h1, h2, or bold text that's not platform name
    const headings = document.querySelectorAll('h1, h2, h3, strong, b, a[href*="/series/"]');
    for (const heading of headings) {
      const text = heading.textContent.trim();
      if (text.length > 3 && text.length < 100 && !unwantedTitles.some(unwanted => text.toLowerCase() === unwanted)) {
        console.log('[ReWatch] Found alternative title from heading:', text);
        cachedTitle = text;
        return text;
      }
    }
    
    return fallback.includes('max') || fallback.includes('hbo') ? 'HBO Max Content' : 'Netflix Content';
  }
  
  // General cleanup - remove platform suffixes
  fallback = fallback
    .replace(/\s*[-|]\s*(HBO\s*Max?|Max|HiAnime|Netflix|Watch\s+on\s+Netflix|Prime\s+Video|Disney\+)$/i, '')
    .replace(/^Watch\s+/i, '');
  
  // Skip if it's just "Netflix" or other generic names
  const fallbackLower = fallback.toLowerCase();
  if (unwantedTitles.some(unwanted => fallbackLower === unwanted)) {
    console.log('[ReWatch] Fallback title is generic:', fallback);
    return 'Netflix Content';
  }
  
  console.log('[ReWatch] Using fallback title:', fallback);
  cachedTitle = fallback;
  return fallback || 'Unknown Title';
};

// For main page: Broadcast URL and title to all iframes
if (window.self === window.top) {
  // Set up MutationObserver to watch for title changes (Netflix loads titles dynamically)
  const startTitleObserver = () => {
    if (titleObserver) return; // Already observing
    
    titleObserver = new MutationObserver((mutations) => {
      // Clear cache when DOM changes, so we re-extract the title
      const oldTitle = cachedTitle;
      cachedTitle = null;
      const newTitle = getPageTitle();
      
      // If title changed, log it
      if (newTitle !== oldTitle && newTitle !== 'Netflix Content' && newTitle !== 'Unknown Title') {
        console.log('[ReWatch Parent] Title updated:', newTitle);
      }
    });
    
    // Observe the entire document for changes
    titleObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    console.log('[ReWatch Parent] Title observer started');
  };
  
  // Start observing when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTitleObserver);
  } else {
    startTitleObserver();
  }
  
  // Also try after a delay for Netflix
  setTimeout(() => {
    cachedTitle = null; // Clear cache to force re-extraction
    getPageTitle();
  }, 2000);

  // Helper function to extract episode number from parent page
  const getEpisodeNumber = () => {
    // Try different universal methods to find episode number
    const methods = [
      // Method 0: HBO Max specific - look for the dedicated season-episode element
      () => {
        if (window.location.hostname.includes('hbo') || window.location.hostname.includes('max')) {
          // HBO Max has a dedicated element for season/episode display
          const seasonEpisodeEl = document.querySelector('[data-testid="player-ux-season-episode"]');
          if (seasonEpisodeEl) {
            const text = seasonEpisodeEl.textContent.trim();
            // Format is "S1 E2:" or "S 1 E 2:"
            const match = text.match(/S\s*\d+\s*E\s*(\d+)/i);
            if (match) {
              console.log('[ReWatch Parent] Found HBO Max episode from dedicated element:', match[1]);
              return parseInt(match[1]);
            }
          }
          // If no dedicated element found, it's not an episode
          console.log('[ReWatch Parent] HBO Max: No season-episode element found, not a series');
          return null;
        }
        return null;
      },
      
      // Method 1: Search for "Episode X" or "Ep X" or "S#E#" patterns in page text
      // For non-HBO platforms
      () => {
        // Skip this for HBO Max (already handled above)
        if (window.location.hostname.includes('hbo') || window.location.hostname.includes('max')) {
          return null;
        }
        
        // For other platforms, search page text
        const bodyText = document.body.textContent;
        const patterns = [
          /\bS\s*\d+\s*E\s*(\d+)\b/i,  // S8 E8, S08E08, etc.
          /Season\s+\d+\s+Episode\s+(\d+)/i,
          /(?:You are watching|Now Playing|Current)[^\d]*Episode\s+(\d+)/i,
          /Episode\s+(\d+)/i,
          /Ep\.?\s+(\d+)/i
        ];
        
        for (const pattern of patterns) {
          const match = bodyText.match(pattern);
          if (match) {
            console.log('[ReWatch Parent] Found episode from text:', match[1]);
            return parseInt(match[1]);
          }
        }
        return null;
      },
      
      // Method 2: Check for active/selected episode in lists
      () => {
        const activeSelectors = [
          '.active[class*="episode"]',
          '.active[class*="ep"]',
          '[class*="episode"].active',
          '[class*="ep"].active',
          '.selected[class*="episode"]',
          '.current[class*="episode"]',
          '[aria-selected="true"][class*="episode"]',
          '[data-selected="true"]'
        ];
        
        for (const selector of activeSelectors) {
          const activeEp = document.querySelector(selector);
          if (activeEp) {
            const match = activeEp.textContent.match(/(\d+)/);
            if (match) {
              console.log('[ReWatch Parent] Found episode from active element:', match[1]);
              return parseInt(match[1]);
            }
          }
        }
        return null;
      },
      
      // Method 3: Check URL parameters
      () => {
        const urlParams = new URLSearchParams(window.location.search);
        const possibleParams = ['ep', 'episode', 'episodeId', 'e'];
        
        for (const param of possibleParams) {
          const value = urlParams.get(param);
          if (value) {
            // Try to extract number from the parameter
            const match = value.match(/(\d+)/);
            if (match) {
              console.log('[ReWatch Parent] Found episode from URL param:', match[1]);
              return parseInt(match[1]);
            }
          }
        }
        return null;
      },
      
      // Method 4: Check URL path
      () => {
        const urlPath = window.location.pathname;
        const patterns = [
          /episode[_-]?(\d+)/i,
          /ep[_-]?(\d+)/i,
          /\/e(\d+)\b/i,
          /\/(\d+)$/  // Episode number at end of path
        ];
        
        for (const pattern of patterns) {
          const match = urlPath.match(pattern);
          if (match) {
            console.log('[ReWatch Parent] Found episode from URL path:', match[1]);
            return parseInt(match[1]);
          }
        }
        return null;
      },
      
      // Method 5: Check meta tags
      () => {
        const metaSelectors = [
          'meta[property="episode"]',
          'meta[name="episode"]',
          'meta[itemprop="episodeNumber"]'
        ];
        
        for (const selector of metaSelectors) {
          const meta = document.querySelector(selector);
          if (meta && meta.content) {
            const match = meta.content.match(/(\d+)/);
            if (match) {
              console.log('[ReWatch Parent] Found episode from meta tag:', match[1]);
              return parseInt(match[1]);
            }
          }
        }
        return null;
      }
    ];

    for (const method of methods) {
      const episodeNum = method();
      if (episodeNum !== null && episodeNum > 0) {
        return episodeNum;
      }
    }

    console.log('[ReWatch Parent] Could not find episode number');
    return null;
  };
  
  // Helper function to extract season number from parent page
  const getSeasonNumber = () => {
    // Try different universal methods to find season number
    const methods = [
      // Method 0: HBO Max specific - look for the dedicated season-episode element
      () => {
        if (window.location.hostname.includes('hbo') || window.location.hostname.includes('max')) {
          // HBO Max has a dedicated element for season/episode display
          const seasonEpisodeEl = document.querySelector('[data-testid="player-ux-season-episode"]');
          if (seasonEpisodeEl) {
            const text = seasonEpisodeEl.textContent.trim();
            // Format is "S1 E2:" or "S 1 E 2:"
            const match = text.match(/S\s*(\d+)\s*E\s*\d+/i);
            if (match) {
              console.log('[ReWatch Parent] Found HBO Max season from dedicated element:', match[1]);
              return parseInt(match[1]);
            }
          }
          // If no dedicated element found, it's not an episode
          console.log('[ReWatch Parent] HBO Max: No season-episode element found, not a series');
          return null;
        }
        return null;
      },
      
      // Method 1: Search for season patterns in page text
      // For non-HBO platforms
      () => {
        // Skip this for HBO Max (already handled above)
        if (window.location.hostname.includes('hbo') || window.location.hostname.includes('max')) {
          return null;
        }
        
        // For other platforms, search page text
        const bodyText = document.body.textContent;
        const patterns = [
          /Season\s+(\d+)/i,
          /Series\s+(\d+)/i,
          /\bS\s*(\d+)\s*E\s*\d+\b/i,  // S8 E8 format
          /\bS(\d+)E\d+\b/i  // S01E05 format
        ];
        
        for (const pattern of patterns) {
          const match = bodyText.match(pattern);
          if (match && parseInt(match[1]) > 0) {
            console.log('[ReWatch Parent] Found season from text:', match[1]);
            return parseInt(match[1]);
          }
        }
        return null;
      },
      
      // Method 2: Check URL for season info
      () => {
        const url = window.location.href;
        const patterns = [
          /season[_-]?(\d+)/i,
          /series[_-]?(\d+)/i,
          /\/s(\d+)e\d+/i,
          /\/s(\d+)\//i
        ];
        
        for (const pattern of patterns) {
          const match = url.match(pattern);
          if (match && parseInt(match[1]) > 0) {
            console.log('[ReWatch Parent] Found season from URL:', match[1]);
            return parseInt(match[1]);
          }
        }
        return null;
      },
      
      // Method 3: Check meta tags
      () => {
        const metaSelectors = [
          'meta[property="season"]',
          'meta[name="season"]',
          'meta[itemprop="seasonNumber"]'
        ];
        
        for (const selector of metaSelectors) {
          const meta = document.querySelector(selector);
          if (meta && meta.content) {
            const match = meta.content.match(/(\d+)/);
            if (match && parseInt(match[1]) > 0) {
              console.log('[ReWatch Parent] Found season from meta tag:', match[1]);
              return parseInt(match[1]);
            }
          }
        }
        return null;
      }
    ];

    for (const method of methods) {
      const seasonNum = method();
      if (seasonNum !== null && seasonNum > 0) {
        return seasonNum;
      }
    }

    console.log('[ReWatch Parent] Could not find season number');
    return null;
  };
  
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ReWatch_REQUEST_INFO') {
      // Send current page URL and title to requesting iframe
      const pageInfo = {
        type: 'ReWatch_PARENT_INFO',
        url: window.location.href,
        title: getPageTitle(),
        episodeNumber: getEpisodeNumber(),
        seasonNumber: getSeasonNumber()
      };
      event.source.postMessage(pageInfo, '*');
      console.log('[ReWatch] Sent parent info to iframe:', pageInfo);
    }
  });
}

// ============================================================================
// PLATFORM-SPECIFIC DETECTORS
// ============================================================================

class PlatformDetector {
  constructor(hostname) {
    this.hostname = hostname;
  }
  
  // Override these in subclasses
  canDetect() { return false; }
  getPlatformName() { return null; }
  extractEpisodeNumber() { return null; }
  extractSeasonNumber() { return null; }
  extractTitle() { return null; }
  extractEpisodeName() { return null; }
  inferEpisodeInfoFromTitle() { return null; }
  getContentType() { return null; }
  isValidPlaybackPage() { return true; }
  filterVideoElements(videoElements) {
    return Array.isArray(videoElements) ? videoElements : [];
  }
  selectVideoElement(videoElements) {
    return null;
  }
}

class HBOMaxDetector extends PlatformDetector {
  canDetect() {
    return this.hostname.includes('hbo') || this.hostname.includes('max');
  }
  
  getPlatformName() {
    return 'HBO Max';
  }
  
  extractEpisodeNumber() {
    const seasonEpisodeElement = document.querySelector('[data-testid="player-ux-season-episode"]');
    if (seasonEpisodeElement && seasonEpisodeElement.textContent) {
      const match = seasonEpisodeElement.textContent.match(/E\s*(\d+)/i);
      if (match) {
        console.log('[ReWatch][HBO] Found episode number:', match[1]);
        return parseInt(match[1]);
      }
    }
    console.log('[ReWatch][HBO] No episode number found - this is a movie');
    return null;
  }
  
  extractSeasonNumber() {
    const seasonEpisodeElement = document.querySelector('[data-testid="player-ux-season-episode"]');
    if (seasonEpisodeElement && seasonEpisodeElement.textContent) {
      const match = seasonEpisodeElement.textContent.match(/S\s*(\d+)/i);
      if (match) {
        console.log('[ReWatch][HBO] Found season number:', match[1]);
        return parseInt(match[1]);
      }
    }
    console.log('[ReWatch][HBO] No season number found - this is a movie');
    return null;
  }
  
  extractTitle() {
    const titleElement = document.querySelector('[data-testid="player-ux-asset-title"]');
    if (titleElement && titleElement.textContent) {
      console.log('[ReWatch][HBO] Found title:', titleElement.textContent.trim());
      return titleElement.textContent.trim();
    }
    return null;
  }
  
  extractEpisodeName() {
    const episodeNameElement = document.querySelector('[data-testid="player-ux-asset-subtitle"]');
    if (episodeNameElement && episodeNameElement.textContent) {
      console.log('[ReWatch][HBO] Found episode name:', episodeNameElement.textContent.trim());
      return episodeNameElement.textContent.trim();
    }
    return null;
  }
  
  isValidPlaybackPage() {
    // Only save if we're in the actual player UI (not on info/details page with trailer)
    const playerUI = document.querySelector('[data-testid="player-ux-asset-title"]');
    if (!playerUI) {
      console.log('[ReWatch][HBO] Not in player UI - likely info page');
      return false;
    }
    return true;
  }
}

class HiAnimeDetector extends PlatformDetector {
  canDetect() {
    return this.hostname.includes('hianime') || this.hostname.includes('aniwatch');
  }
  
  getPlatformName() {
    return 'HiAnime';
  }
  
  extractEpisodeNumber() {
    // First try the specific container
    const watchingText = document.querySelector('.film-watching, [class*="watching"], .server-notice');
    if (watchingText) {
      const match = watchingText.textContent.match(/Episode\s+(\d+)/i);
      if (match) {
        console.log('[ReWatch][HiAnime] Found episode from watching text:', match[1]);
        return parseInt(match[1]);
      }
    }
    
    // Fallback: search entire document for "You are watching Episode X"
    const bodyText = document.body.textContent;
    const match = bodyText.match(/You are watching.*?Episode\s+(\d+)/i);
    if (match) {
      console.log('[ReWatch][HiAnime] Found episode from body text:', match[1]);
      return parseInt(match[1]);
    }
    
    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const epParam = urlParams.get('ep');
    if (epParam) {
      console.log('[ReWatch][HiAnime] Found episode from URL param:', epParam);
      return parseInt(epParam);
    }
    
    return null;
  }
  
  extractSeasonNumber() {
    // HiAnime doesn't typically use seasons, but check URL if present
    const urlPath = window.location.pathname;
    const match = urlPath.match(/season[_-]?(\d+)/i);
    if (match) {
      console.log('[ReWatch][HiAnime] Found season from URL:', match[1]);
      return parseInt(match[1]);
    }
    return null;
  }
  
  extractTitle() {
    const titleElement = document.querySelector('.film-name, [class*="film-name"]');
    if (titleElement && titleElement.textContent) {
      console.log('[ReWatch][HiAnime] Found title:', titleElement.textContent.trim());
      return titleElement.textContent.trim();
    }
    return null;
  }
  
  extractEpisodeName() {
    return null; // HiAnime typically doesn't show episode names in player
  }
}

class DisneyPlusDetector extends PlatformDetector {
  canDetect() {
    return this.hostname.includes('disneyplus');
  }

  getPlatformName() {
    return 'Disney+';
  }

  filterVideoElements(videoElements) {
    if (!Array.isArray(videoElements) || videoElements.length === 0) {
      return [];
    }

    const filtered = [];

    for (const video of videoElements) {
      if (!video) {
        continue;
      }

      try {
        if (this._isIgnoredNode(video) || isNodeInUpNextSection(video)) {
          continue;
        }

        const duration = Number.isFinite(video.duration) ? video.duration : null;
        const isShortClip = duration !== null && duration > 0 && duration < 60;

        const getAttr = (element, attribute) => {
          if (!element || typeof element.getAttribute !== 'function') {
            return '';
          }
          const value = element.getAttribute(attribute);
          return value ? value.toLowerCase() : '';
        };

        const dataTestId = getAttr(video, 'data-testid');
        const classTokens = video.classList ? Array.from(video.classList).map((cls) => (cls || '').toLowerCase()) : [];
        const parentTestId = getAttr(video.parentElement, 'data-testid');

        const looksLikePromo = (
          (dataTestId && /promo|tile|brand-set|rails?-video/.test(dataTestId)) ||
          classTokens.some((cls) => /promo|tile-video|sizzle|brand-set|brandset/.test(cls)) ||
          (parentTestId && /promo|tile|brand-set/.test(parentTestId))
        );

        if (isShortClip && (video.loop || looksLikePromo || !this._isWithinPlaybackView(video))) {
          console.log('[ReWatch][Disney+] Skipping short-form promo clip');
          continue;
        }

        if (!this._isWithinPlaybackView(video) && (isShortClip || looksLikePromo)) {
          continue;
        }
      } catch (error) {
        console.log('[ReWatch][Disney+] Error while filtering video candidates:', error.message);
        continue;
      }

      filtered.push(video);
    }

    return filtered.length ? filtered : videoElements;
  }

  selectVideoElement(videoElements) {
    if (!Array.isArray(videoElements) || videoElements.length === 0) {
      return null;
    }

    const haveMetadata = (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.HAVE_METADATA) || 1;
    const info = this._collectSeasonEpisodeInfo();
    const path = window.location.pathname || '';
    const contentType = this._determineContentType(info, path);

    const scoredCandidates = videoElements.map((video) => {
      let score = 0;

      try {
        const rect = video.getBoundingClientRect();
        const area = Math.max(0, rect.width) * Math.max(0, rect.height);
        if (area > 0) {
          score += Math.min(area / 4000, 40);
        }
      } catch (error) {
        console.log('[ReWatch][Disney+] Error measuring video candidate:', error.message);
      }

      const readyState = Number.isFinite(video.readyState) ? video.readyState : 0;
      if (readyState >= haveMetadata) {
        score += 40;
      }
      if (readyState > haveMetadata) {
        score += 15;
      }

      const duration = Number.isFinite(video.duration) ? video.duration : NaN;
      if (Number.isFinite(duration)) {
        if (duration >= MINIMUM_CLIP_DURATION_SECONDS) {
          score += 80;
        } else if (duration >= 120) {
          score += 20;
        } else if (duration > 0) {
          score += 5;
        }
      }

      const hasBuffered = video.buffered && typeof video.buffered.length === 'number' && video.buffered.length > 0;
      if (hasBuffered) {
        score += 10;
      }

      const currentSrc = typeof video.currentSrc === 'string' ? video.currentSrc : '';
      if (currentSrc.startsWith('blob:')) {
        score += 25;
      } else if (/disney|bamgrid/.test(currentSrc)) {
        score += 15;
      }

      if (contentType === 'episode' && this._isSeriesVideoCandidate(video)) {
        score += 30;
      }

      if (contentType === 'movie' && this._isMovieVideoCandidate(video)) {
        score += 30;
      }

      if (this._isWithinPlaybackView(video)) {
        score += 35;
      }

      if (video.autoplay && !video.loop) {
        score += 5;
      }

      return {
        video,
        score
      };
    }).sort((a, b) => b.score - a.score);

    const bestCandidate = scoredCandidates[0];

    if (!bestCandidate || !bestCandidate.video) {
      return null;
    }

    if (bestCandidate.score <= 0 && videoElements.length > 0) {
      return videoElements[0];
    }

    return bestCandidate.video;
  }

  _isIgnoredNode(node) {
    let current = node;

    while (current) {
      if (current.id) {
        const id = String(current.id).toLowerCase();
        if (id.startsWith('onetrust') || id === 'ot-sdk-btn') {
          return true;
        }
      }

      const classList = current.classList;
      if (classList && typeof classList.forEach === 'function') {
        let found = false;
        classList.forEach((cls) => {
          if (found || !cls) {
            return;
          }
          const value = String(cls).toLowerCase();
          if (value.includes('onetrust') || value.includes('cookie-preference') || value.includes('cookie_preference')) {
            found = true;
          }
        });
        if (found) {
          return true;
        }
      }

      if (typeof current.getAttribute === 'function') {
        const role = current.getAttribute('role');
        const ariaLabel = current.getAttribute('aria-label') || '';
        if (role && role.toLowerCase() === 'dialog' && ariaLabel.toLowerCase().includes('cookie')) {
          return true;
        }
      }

      if (current.parentElement) {
        current = current.parentElement;
        continue;
      }

      if (typeof current.getRootNode === 'function') {
        const root = current.getRootNode();
        if (root && root.host && root !== current) {
          current = root.host;
          continue;
        }
      }

      break;
    }

    return false;
  }

  _parseSeasonEpisode(text) {
    if (!text || typeof text !== 'string') {
      return null;
    }

    const normalized = text.replace(/[\u2068\u2069\u202A-\u202E]/g, '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return null;
    }

    const seasonEpisodeMatch = normalized.match(/\bS(?:eason)?\s*(\d{1,2})\s*(?:[:E]|Episode)\s*(\d{1,3})/i);
    if (seasonEpisodeMatch) {
      return {
        season: parseInt(seasonEpisodeMatch[1], 10),
        episode: parseInt(seasonEpisodeMatch[2], 10)
      };
    }

    const spelledMatch = normalized.match(/Season\s+(\d{1,2}).*Episode\s+(\d{1,3})/i);
    if (spelledMatch) {
      return {
        season: parseInt(spelledMatch[1], 10),
        episode: parseInt(spelledMatch[2], 10)
      };
    }

    const episodeOnlyMatch = normalized.match(/\bEpisode\s+(\d{1,3})\b/i) || normalized.match(/\bE\s*(\d{1,3})\b/i);
    if (episodeOnlyMatch) {
      return {
        episode: parseInt(episodeOnlyMatch[1], 10)
      };
    }

    return null;
  }

  _collectSeasonEpisodeInfo() {
    const selectors = [
      '.title-bug-area .subtitle-field span',
      '.title-bug-container .subtitle-field span',
      '[data-testid="playback-details"]',
      '[data-testid="playback-subtitle"]',
      '[data-testid="player-subtitle"]',
      '[data-testid="playback-metadata"]',
      '[class*="SeasonEpisode"]',
      '[class*="seasonEpisode"]',
      '[class*="season-episode"]',
      '.subtitle-field span',
      '.subtitle-field'
    ];

    const seen = new Set();

    const evaluateText = (text) => {
      if (!text) {
        return null;
      }
      const trimmed = text.trim();
      if (!trimmed || trimmed.length > 200 || seen.has(trimmed)) {
        return null;
      }
      const lowered = trimmed.toLowerCase();
      if (UP_NEXT_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
        return null;
      }
      seen.add(trimmed);
      return this._parseSeasonEpisode(trimmed);
    };

    const parsedFromSelectors = findAcrossAllRoots(selectors, (node) => {
      const element = getElementNode(node);
      if (!element) {
        return null;
      }

      if (!isNodeVisible(element) || isNodeInUpNextSection(element)) {
        return null;
      }

      if (this._isIgnoredNode(element) || shouldSkipTitleNode(element)) {
        return null;
      }

      return evaluateText(element.textContent || '');
    });

    if (parsedFromSelectors) {
      return parsedFromSelectors;
    }

    const parsedFromAria = findAcrossAllRoots('[aria-label]', (node) => {
      const element = getElementNode(node);
      if (!element || typeof element.getAttribute !== 'function') {
        return null;
      }

      if (!isNodeVisible(element) || isNodeInUpNextSection(element)) {
        return null;
      }

      if (this._isIgnoredNode(element) || shouldSkipTitleNode(element)) {
        return null;
      }

      return evaluateText(element.getAttribute('aria-label'));
    });

    if (parsedFromAria) {
      return parsedFromAria;
    }

    const overlayFallback = this._extractOverlaySeasonEpisodeInfo();
    if (overlayFallback) {
      return overlayFallback;
    }

    return null;
  }

  _extractOverlaySeasonEpisodeInfo() {
    const overlaySelectors = [
      '.title-bug-container .subtitle-field span',
      '.title-bug-area .subtitle-field span',
      '.subtitle-field span',
      '.subtitle-field',
      '[data-testid="playback-subtitle"]',
      '[data-testid="player-subtitle"]',
      '[data-testid="playback-details"]',
      '[data-testid="playback-metadata"]',
      '[data-testid="playback-subtitle-text"]'
    ];

    const seen = new Set();

    return findAcrossAllRoots(overlaySelectors, (node) => {
      const element = getElementNode(node);
      if (!element) {
        return null;
      }

      if (this._isIgnoredNode(element) || isNodeInUpNextSection(element)) {
        return null;
      }

      const textContent = element.textContent || '';
      const trimmed = textContent.replace(/\s+/g, ' ').trim();
      if (!trimmed || trimmed.length > 200 || seen.has(trimmed)) {
        return null;
      }

      seen.add(trimmed);
      return this._parseSeasonEpisode(trimmed);
    });
  }

  _determineContentType(info, path) {
    if (info && (Number.isFinite(info.episode) || Number.isFinite(info.season))) {
      return 'episode';
    }

    if (path && this._isSeriesRoute(path)) {
      return 'episode';
    }

    return 'movie';
  }

  extractEpisodeNumber() {
    const info = this._collectSeasonEpisodeInfo();
    return info && Number.isFinite(info.episode) ? parseInt(info.episode, 10) : null;
  }

  extractSeasonNumber() {
    const info = this._collectSeasonEpisodeInfo();
    return info && Number.isFinite(info.season) ? parseInt(info.season, 10) : null;
  }

  extractTitle() {
    const selectors = [
      '[data-testid="playback-title"]',
      '[data-testid="player-title"]',
      '[data-testid="title"]',
      '[data-testid="hero-image-title"]',
      'h1[data-testid]',
      'h1[class*="Title"]',
      'h1',
      '.title-bug-area .title-field span',
      '.title-bug-container .title-field span',
      '.title-field span',
      '.title-field'
    ];

    const fromSelectors = findAcrossAllRoots(selectors, (node) => {
      const element = getElementNode(node);
      if (!element || !element.textContent) {
        return null;
      }

      if (!isNodeVisible(element) || isNodeInUpNextSection(element)) {
        return null;
      }

      if (this._isIgnoredNode(element) || shouldSkipTitleNode(element)) {
        return null;
      }

      const text = element.textContent.trim();
      if (!text || text.length <= 1 || /^disney\+?$/i.test(text)) {
        return null;
      }

      const normalized = text.toLowerCase();
      if (
        normalized === 'audio' ||
        normalized === 'audio and subtitles' ||
        normalized === 'audio & subtitles' ||
        normalized === 'subtitles' ||
        normalized === 'settings'
      ) {
        return null;
      }

      if (
        normalized.includes('cookie preference center') ||
        normalized.includes('cookie preferences') ||
        normalized.includes('privacy preference center')
      ) {
        return null;
      }

      return text
        .replace(/\s*[•|]\s*Disney\+?$/i, '')
        .replace(/\s*\|\s*Disney\+?$/i, '')
        .trim();
    });

    if (fromSelectors) {
      return fromSelectors;
    }

    const docTitle = document.title;
    if (docTitle) {
      const clean = docTitle.replace(/\s*[•|]\s*Disney\+?$/i, '').trim();
      if (
        clean &&
        !/^disney\+?$/i.test(clean) &&
        !/cookie preference center/i.test(clean) &&
        !/cookie preferences/i.test(clean) &&
        !/privacy preference center/i.test(clean)
      ) {
        return clean;
      }
    }

    return null;
  }

  extractEpisodeName() {
    const selectors = [
      '[data-testid="playback-subtitle"]',
      '[data-testid="player-subtitle"]',
      '[data-testid="subtitle"]',
      '[class*="EpisodeTitle"]',
      '[class*="episodeTitle"]',
      '.title-bug-area .subtitle-field span',
      '.title-bug-container .subtitle-field span',
      '.subtitle-field span',
      '.subtitle-field'
    ];

    const extracted = findAcrossAllRoots(selectors, (node) => {
      const element = getElementNode(node);
      if (!element || !element.textContent) {
        return null;
      }

      if (!isNodeVisible(element) || isNodeInUpNextSection(element)) {
        return null;
      }

      if (this._isIgnoredNode(element) || shouldSkipTitleNode(element)) {
        return null;
      }

      let text = element.textContent.trim();
      if (!text) {
        return null;
      }

      if (UP_NEXT_KEYWORDS.some((keyword) => text.toLowerCase().includes(keyword))) {
        return null;
      }

      const info = this._parseSeasonEpisode(text);
      if (info) {
        text = text
          .replace(/\bS(?:eason)?\s*\d{1,2}\s*(?:[:E]|Episode)\s*\d{1,3}/i, '')
          .replace(/Season\s+\d{1,2}.*Episode\s+\d{1,3}/i, '')
          .replace(/Episode\s+\d{1,3}/i, '')
          .replace(/E\s*\d{1,3}/i, '')
          .replace(/^[•\-\—:\s]+/, '')
          .trim();
      }

      if (text && text.length > 1 && text.length < 150) {
        return text;
      }

      return null;
    });

    if (extracted) {
      return extracted;
    }

    return null;
  }

  getContentType() {
    const info = this._collectSeasonEpisodeInfo();
    const path = window.location.pathname || '';
    return this._determineContentType(info, path);
  }

  _playbackRootSelectors() {
    return [
      '[data-testid="playback-view"]',
      '[data-testid="playback-root"]',
      '[data-testid="dss-player"]',
      'dss-player',
      'dss-video-player',
      'disney-web-player',
      'disney-web-player-ui',
      '#hudson-wrapper',
      '.hudson-container',
      '.btm-media-player',
      '.btm-media-clients',
      '.media-element-container',
      'video[id^="hivePlayer"]'
    ];
  }

  _getPlaybackRoot() {
    const selectors = this._playbackRootSelectors();
    const found = findAcrossAllRoots(selectors, (node) => node);
    return found || null;
  }

  _isWithinPlaybackView(node) {
    if (!node || typeof node.closest !== 'function') {
      const root = this._getPlaybackRoot();
      return !root;
    }

    const selectors = this._playbackRootSelectors();
    const selectorString = selectors.join(', ');

    try {
      const closestMatch = node.closest(selectorString);
      if (closestMatch) {
        return true;
      }
    } catch (error) {
      console.log('[ReWatch][Disney+] Error during closest playback lookup:', error.message);
    }

    const playbackRoot = this._getPlaybackRoot();
    if (!playbackRoot) {
      return true;
    }

    if (playbackRoot === node) {
      return true;
    }

    if (typeof playbackRoot.contains === 'function') {
      try {
        if (playbackRoot.contains(node)) {
          return true;
        }
      } catch (error) {
        console.log('[ReWatch][Disney+] Error checking playback containment:', error.message);
      }
    }

    if (typeof node.getRootNode === 'function') {
      const rootNode = node.getRootNode();
      const host = rootNode && rootNode.host;
      if (host && typeof host.matches === 'function') {
        try {
          if (selectors.some((selector) => {
            try {
              return host.matches(selector);
            } catch (_error) {
              return false;
            }
          })) {
            return true;
          }
        } catch (error) {
          console.log('[ReWatch][Disney+] Error checking shadow host for playback view:', error.message);
        }
      }
    }

    return false;
  }

  _isSeriesRoute(path) {
    if (!path || typeof path !== 'string') {
      return false;
    }

    return /(\/series\/|\/season\/|\/seasons\/|\/episode\/|\/episodes\/)/i.test(path);
  }

  _isMovieRoute(path) {
    if (!path || typeof path !== 'string') {
      return false;
    }

    if (/(\/play\/|\/movie\/|\/movies\/|\/film\/|\/films\/)/i.test(path)) {
      return true;
    }

    if (/\/video\//i.test(path)) {
      return !this._isSeriesRoute(path);
    }

    return false;
  }

  _hasEpisodeMetadata(info) {
    return Boolean(info && (Number.isFinite(info.episode) || Number.isFinite(info.season)));
  }

  _isSeriesVideoCandidate(video) {
    if (!video) {
      return false;
    }

    if (!this._isWithinPlaybackView(video) || isNodeInUpNextSection(video)) {
      return false;
    }

    if (!isNodeVisible(video)) {
      return false;
    }

    const haveMetadata = (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.HAVE_METADATA) || 1;
    const readyState = Number.isFinite(video.readyState) ? video.readyState : 0;
    const duration = Number.isFinite(video.duration) ? video.duration : null;

    if (duration !== null && duration > 0 && duration < 120) {
      return false;
    }

    return readyState >= haveMetadata || typeof video.duration === 'number';
  }

  _isMovieVideoCandidate(video) {
    if (!video) {
      return false;
    }

    if (!this._isWithinPlaybackView(video) || isNodeInUpNextSection(video)) {
      return false;
    }

    if (!isNodeVisible(video)) {
      return false;
    }

    const haveMetadata = (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.HAVE_METADATA) || 1;
    const readyState = Number.isFinite(video.readyState) ? video.readyState : 0;
    const duration = Number.isFinite(video.duration) ? video.duration : null;

    if (duration !== null && duration > 0 && duration < 120) {
      return false;
    }

    if (readyState >= haveMetadata) {
      return true;
    }

    const rect = video.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0;
  }

  _isValidSeriesPlayback(videoElements, path, info, contentType) {
    if (!Array.isArray(videoElements) || videoElements.length === 0) {
      return false;
    }

    if (videoElements.some((video) => this._isSeriesVideoCandidate(video))) {
      return true;
    }

    if (contentType === 'episode' || this._isSeriesRoute(path) || this._hasEpisodeMetadata(info)) {
      return true;
    }

    return false;
  }

  _isValidMoviePlayback(videoElements, path, info, contentType) {
    if (!Array.isArray(videoElements) || videoElements.length === 0) {
      return false;
    }

    if (videoElements.some((video) => this._isMovieVideoCandidate(video))) {
      return true;
    }

    if (contentType === 'movie' || this._isMovieRoute(path)) {
      return !this._hasEpisodeMetadata(info);
    }

    return false;
  }

  isValidPlaybackPage() {
    const path = window.location.pathname || '';
    const videoElements = findAllVideoElements();
    const seasonEpisodeInfo = this._collectSeasonEpisodeInfo();
    const contentType = this._determineContentType(seasonEpisodeInfo, path);
    const playbackRoot = this._getPlaybackRoot();
    const hasVisiblePlaybackRoot = playbackRoot && isNodeVisible(playbackRoot);
    const isPlaybackRoute = /\/video\//i.test(path) || this._isMovieRoute(path) || this._isSeriesRoute(path);

    if (!isPlaybackRoute && !hasVisiblePlaybackRoot) {
      return false;
    }

    if (this._isValidSeriesPlayback(videoElements, path, seasonEpisodeInfo, contentType)) {
      return true;
    }

    if (this._isValidMoviePlayback(videoElements, path, seasonEpisodeInfo, contentType)) {
      return true;
    }

    return Array.isArray(videoElements) && videoElements.length > 0;
  }
}

class NetflixDetector extends PlatformDetector {
  constructor(hostname) {
    super(hostname);
    this._parsedFalcorCache = null;
    this._parsedReactContext = null;
    this._scriptsParsed = false;
  }

  canDetect() {
    return this.hostname.includes('netflix');
  }

  getPlatformName() {
    return 'Netflix';
  }
  
  // Get Netflix metadata from window.netflix.reactContext or window.netflix object
  getNetflixMetadata() {
    try {
      // Netflix stores video metadata in window.netflix.reactContext
      if (window.netflix && window.netflix.reactContext) {
        const models = window.netflix.reactContext.models;
        if (models && models.videoPlayer && models.videoPlayer.data) {
          return models.videoPlayer.data;
        }
      }
      
      // Alternative: Check playerModel
      if (window.netflix && window.netflix.playerModel) {
        return window.netflix.playerModel;
      }
    } catch (e) {
      console.log('[ReWatch][Netflix] Error accessing metadata:', e.message);
    }

    const parsed = this.parseEmbeddedNetflixData();
    if (parsed && parsed.reactContext && parsed.reactContext.models) {
      const models = parsed.reactContext.models;
      if (models.videoPlayer && models.videoPlayer.data) {
        return models.videoPlayer.data;
      }
      if (models.playerModel && models.playerModel.data) {
        return models.playerModel.data;
      }
    }

    return null;
  }

  getFalcorCache() {
    try {
      if (window.netflix && window.netflix.falcorCache) {
        return window.netflix.falcorCache;
      }
    } catch (e) {
      console.log('[ReWatch][Netflix] Error accessing falcorCache:', e.message);
    }
    const parsed = this.parseEmbeddedNetflixData();
    return parsed ? parsed.falcorCache : null;
  }

  getCurrentVideoId() {
    const urlMatch = window.location.pathname.match(/\/watch\/(\d+)/);
    if (urlMatch) {
      return urlMatch[1];
    }

    const cache = this.getFalcorCache();
    const lolomoId = cache?.lolomo?.summary?.value?.currentVideoId;
    if (lolomoId) {
      return String(lolomoId);
    }

    const sessionId = cache?.sessionContext?.current?.value?.videoId;
    if (sessionId) {
      return String(sessionId);
    }

    return null;
  }

  getCurrentVideoEntry() {
    const cache = this.getFalcorCache();
    const videoId = this.getCurrentVideoId();
    if (!cache || !cache.videos || !videoId) {
      return null;
    }

    const videoEntry = cache.videos[videoId];
    if (videoEntry) {
      return {
        cache,
        videoId,
        videoEntry
      };
    }

    return null;
  }

  getContentType() {
    const entry = this.getCurrentVideoEntry();
    const summary = entry?.videoEntry?.summary?.value;

    if (summary) {
      const normalizedType = typeof summary.type === 'string' ? summary.type.toLowerCase() : null;
      if (normalizedType === 'episode') {
        return 'episode';
      }
      if (normalizedType === 'movie') {
        return 'movie';
      }

      if (Number.isFinite(summary.episode) || Number.isFinite(summary.season)) {
        return 'episode';
      }
    }

    const metadata = this.getNetflixMetadata();
    if (metadata) {
      const typeCandidates = [
        metadata.type,
        metadata.videoType,
        metadata?.video?.type,
        metadata?.video?.summary?.type,
        metadata?.currentVideo?.type,
        metadata?.currentVideo?.summary?.type
      ].filter(value => typeof value === 'string').map(value => value.toLowerCase());

      if (typeCandidates.includes('episode')) {
        return 'episode';
      }
      if (typeCandidates.includes('movie')) {
        return 'movie';
      }

      if (
        Number.isFinite(metadata.episodeNumber) ||
        Number.isFinite(metadata.episode) ||
        Number.isFinite(metadata.currentEpisode) ||
        metadata.episodeTitle ||
        metadata.currentEpisodeTitle ||
        metadata.episodeName
      ) {
        return 'episode';
      }
    }

    const title = typeof this.extractTitle === 'function' ? this.extractTitle() : null;
    if (title) {
      const inferred = this.inferEpisodeInfoFromTitle(title);
      if (inferred) {
        return 'episode';
      }
    }

    return null;
  }

  inferEpisodeInfoFromTitle(title) {
    if (!title || typeof title !== 'string') {
      return null;
    }

    const normalized = title.replace(/[\u2068\u2069\u202A-\u202E]/g, '').trim();
    if (!normalized) {
      return null;
    }

    const buildResult = (prefix, episodeValue, seasonValue, suffix) => {
      const result = {};

      if (seasonValue !== undefined && seasonValue !== null) {
        const seasonNumber = parseInt(seasonValue, 10);
        if (Number.isFinite(seasonNumber)) {
          result.season = seasonNumber;
        }
      }

      if (episodeValue !== undefined && episodeValue !== null) {
        const episodeNumber = parseInt(episodeValue, 10);
        if (Number.isFinite(episodeNumber)) {
          result.episode = episodeNumber;
        }
      }

  const cleanPrefix = prefix ? prefix.trim().replace(/[\-,–—:|]+$/, '').trim() : '';
      if (cleanPrefix) {
        result.seriesTitle = cleanPrefix;
      }

  const cleanSuffix = suffix ? suffix.trim().replace(/^[\-,–—:|]+/, '').trim() : '';
      if (cleanSuffix) {
        result.episodeName = cleanSuffix;
      }

      return Object.keys(result).length > 0 ? result : null;
    };

    const seasonEpisodeMatch = normalized.match(/(.*?)(?:\bS\s*(\d{1,2})\s*[.:]?\s*E\s*(\d{1,3}))(.*)/i);
    if (seasonEpisodeMatch) {
      const [, prefix, seasonValue, episodeValue, suffix] = seasonEpisodeMatch;
      const result = buildResult(prefix, episodeValue, seasonValue, suffix);
      if (result) {
        return result;
      }
    }

    const episodeWordMatch = normalized.match(/(.*?)(?:\bEpisode\s+(\d{1,3}))(.*)/i);
    if (episodeWordMatch) {
      const [, prefix, episodeValue, suffix] = episodeWordMatch;
      const result = buildResult(prefix, episodeValue, null, suffix);
      if (result) {
        return result;
      }
    }

    const simpleEmatch = normalized.match(/(.*?)(\bE\s*[-.:]?\s*(\d{1,3}))(.*)/i);
    if (simpleEmatch) {
      const prefix = simpleEmatch[1];
      const episodeValue = simpleEmatch[3];
      const suffix = simpleEmatch[4];
      const result = buildResult(prefix, episodeValue, null, suffix);
      if (result) {
        return result;
      }
    }

    return null;
  }

  parseEmbeddedNetflixData() {
    if (this._scriptsParsed) {
      return {
        falcorCache: this._parsedFalcorCache,
        reactContext: this._parsedReactContext
      };
    }

    this._scriptsParsed = true;

    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      if (!this._parsedFalcorCache) {
        const falcorMatch = text.match(/netflix\.falcorCache\s*=\s*(\{[\s\S]*?\});/);
        if (falcorMatch) {
          this._parsedFalcorCache = this.safeParseNetflixObject(falcorMatch[1]);
        }
      }

      if (!this._parsedReactContext) {
        const reactMatch = text.match(/netflix\.reactContext\s*=\s*(\{[\s\S]*?\});/);
        if (reactMatch) {
          this._parsedReactContext = this.safeParseNetflixObject(reactMatch[1]);
        }
      }

      if (this._parsedFalcorCache && this._parsedReactContext) {
        break;
      }
    }

    if (!this._parsedFalcorCache || !this._parsedReactContext) {
      this._scriptsParsed = false;
    }

    return {
      falcorCache: this._parsedFalcorCache,
      reactContext: this._parsedReactContext
    };
  }

  safeParseNetflixObject(source) {
    if (!source || typeof source !== 'string') {
      return null;
    }

    const candidates = this.buildNetflixParseCandidates(source);

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch (error) {
        console.warn('[ReWatch][Netflix] JSON parsing attempt failed:', error.message);
      }
    }

    const preview = candidates[0] ? candidates[0].slice(0, 200) : '';
    console.warn('[ReWatch][Netflix] Unable to parse embedded object after sanitization', preview ? { preview } : undefined);
    return null;
  }

  buildNetflixParseCandidates(rawSource) {
    const candidates = [];
    const seen = new Set();

    const addCandidate = value => {
      const candidate = typeof value === 'string' ? value.trim() : '';
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    };

    addCandidate(rawSource);
    const sanitized = this.sanitizeNetflixObjectLiteral(rawSource);
    addCandidate(sanitized);

    return candidates;
  }

  sanitizeNetflixObjectLiteral(literal) {
    if (typeof literal !== 'string') {
      return '';
    }

    let sanitized = literal.trim().replace(/;+\s*$/, '');

    sanitized = sanitized.replace(/\\x([0-9A-Fa-f]{2})/g, (_match, hex) => `\\u00${hex.toUpperCase()}`);
    sanitized = sanitized.replace(/[\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()}`);

    return sanitized;
  }

  normalizeNetflixNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return parseInt(value, 10);
    }

    if (typeof value === 'string') {
      const directParse = parseInt(value, 10);
      if (!Number.isNaN(directParse)) {
        return directParse;
      }

      const digitsMatch = value.match(/\d+/);
      if (digitsMatch) {
        const parsed = parseInt(digitsMatch[0], 10);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }

    if (value && typeof value === 'object') {
      const objectCandidates = [value.episode, value.seq, value.number];
      for (const candidate of objectCandidates) {
        const normalized = this.normalizeNetflixNumber(candidate);
        if (normalized !== null && normalized !== undefined) {
          return normalized;
        }
      }
    }

    return null;
  }

  extractNumericMetadataField(metadata, paths) {
    if (!metadata) {
      return null;
    }

    for (const path of paths) {
      const value = path.split('.').reduce((acc, key) => {
        if (acc && acc[key] !== undefined && acc[key] !== null) {
          return acc[key];
        }
        return undefined;
      }, metadata);

      const normalized = this.normalizeNetflixNumber(value);
      if (normalized !== null && normalized !== undefined) {
        return normalized;
      }
    }

    return null;
  }
  
  extractEpisodeNumber() {
    const entry = this.getCurrentVideoEntry();
    const falcorEpisode = entry?.videoEntry?.summary?.value?.episode;
    if (Number.isFinite(falcorEpisode)) {
      const epNum = parseInt(falcorEpisode, 10);
      console.log('[ReWatch][Netflix] Found episode number from falcorCache:', epNum);
      return epNum;
    }

    const metadata = this.getNetflixMetadata();
    if (metadata) {
      const episodeFromMetadata = this.extractNumericMetadataField(metadata, [
        'episodeNumber',
        'episode',
        'currentEpisode',
        'playerState.currentEpisode',
        'playerState.episode',
        'video.episode',
        'video.summary.episode',
        'video.currentEpisode',
        'currentVideo.episode',
        'currentVideo.summary.episode',
        'currentVideo.currentEpisode',
        'currentVideoMetadata.episode',
        'currentVideoMetadata.summary.episode',
        'episodeContext.episode'
      ]);

      if (episodeFromMetadata !== null && episodeFromMetadata !== undefined) {
        console.log('[ReWatch][Netflix] Found episode number from metadata:', episodeFromMetadata);
        return episodeFromMetadata;
      }
    }

    const inferredFromTitle = this.inferEpisodeInfoFromTitle(this.extractTitle?.());
    if (inferredFromTitle && Number.isFinite(inferredFromTitle.episode)) {
      console.log('[ReWatch][Netflix] Inferred episode number from title:', inferredFromTitle.episode);
      return inferredFromTitle.episode;
    }

    const summaryType = entry?.videoEntry?.summary?.value?.type;
    if (summaryType && typeof summaryType === 'string' && summaryType.toLowerCase() === 'movie') {
      return null;
    }

    console.log('[ReWatch][Netflix] No episode number found for current video');
    return null;
  }
  
  extractSeasonNumber() {
    const entry = this.getCurrentVideoEntry();
    const falcorSeason = entry?.videoEntry?.summary?.value?.season;
    if (Number.isFinite(falcorSeason)) {
      const seasonNum = parseInt(falcorSeason, 10);
      console.log('[ReWatch][Netflix] Found season number from falcorCache:', seasonNum);
      return seasonNum;
    }

    const metadata = this.getNetflixMetadata();
    if (metadata) {
      const seasonFromMetadata = this.extractNumericMetadataField(metadata, [
        'seasonNumber',
        'season',
        'currentSeason',
        'playerState.currentSeason',
        'playerState.season',
        'video.season',
        'video.summary.season',
        'currentVideo.season',
        'currentVideo.summary.season',
        'currentVideo.currentSeason',
        'currentVideoMetadata.season',
        'currentVideoMetadata.summary.season',
        'episodeContext.season'
      ]);

      if (seasonFromMetadata !== null && seasonFromMetadata !== undefined) {
        console.log('[ReWatch][Netflix] Found season number from metadata:', seasonFromMetadata);
        return seasonFromMetadata;
      }
    }

    const inferredFromTitle = this.inferEpisodeInfoFromTitle(this.extractTitle?.());
    if (inferredFromTitle && Number.isFinite(inferredFromTitle.season)) {
      console.log('[ReWatch][Netflix] Inferred season number from title:', inferredFromTitle.season);
      return inferredFromTitle.season;
    }

    const summaryType = entry?.videoEntry?.summary?.value?.type;
    if (summaryType && typeof summaryType === 'string' && summaryType.toLowerCase() === 'movie') {
      return null;
    }

    console.log('[ReWatch][Netflix] No season number found for current video');
    return null;
  }
  
  extractTitle() {
    const metadata = this.getNetflixMetadata();
    if (metadata) {
      // Check for title in metadata
      if (metadata.title) {
        console.log('[ReWatch][Netflix] Found title from metadata:', metadata.title);
        return metadata.title;
      }
      
      // Check seriesTitle for shows
      if (metadata.seriesTitle || metadata.showTitle) {
        const title = metadata.seriesTitle || metadata.showTitle;
        console.log('[ReWatch][Netflix] Found series title from metadata:', title);
        return title;
      }
    }

    const entry = this.getCurrentVideoEntry();
    if (entry?.videoEntry?.title?.value && entry.videoEntry.summary?.value?.type === 'movie') {
      console.log('[ReWatch][Netflix] Found movie title from falcorCache:', entry.videoEntry.title.value);
      return entry.videoEntry.title.value;
    }
    
    // Fallback: Try to get from document title
    const docTitle = document.title;
    if (docTitle && docTitle !== 'Netflix') {
      // Netflix document title is usually "Title - Netflix" or just the title
      const cleanTitle = docTitle.replace(/\s*-\s*Netflix\s*$/i, '').trim();
      if (cleanTitle) {
        console.log('[ReWatch][Netflix] Found title from document.title:', cleanTitle);
        return cleanTitle;
      }
    }
    
    return null;
  }
  
  extractEpisodeName() {
    const metadata = this.getNetflixMetadata();
    if (metadata) {
      // Check for episode title
      if (metadata.episodeTitle) {
        console.log('[ReWatch][Netflix] Found episode name from metadata:', metadata.episodeTitle);
        return metadata.episodeTitle;
      }
      
      // Sometimes it's in currentEpisodeTitle
      if (metadata.currentEpisodeTitle) {
        console.log('[ReWatch][Netflix] Found episode name from currentEpisodeTitle:', metadata.currentEpisodeTitle);
        return metadata.currentEpisodeTitle;
      }
    }
    
    return null;
  }
  
  isValidPlaybackPage() {
    // Only save if we're on an actual watch page, not a preview/browse page
    // Netflix watch pages have the class "watch-video-root" on the html element
    const htmlElement = document.documentElement;
    if (!htmlElement.classList.contains('watch-video-root')) {
      console.log('[ReWatch][Netflix] Not on watch page - likely a preview/browse page');
      return false;
    }
    
    // Also check URL - should be /watch/
    if (!/\/watch\/\d+/i.test(window.location.pathname)) {
      console.log('[ReWatch][Netflix] URL does not contain /watch/ - not a playback page');
      return false;
    }
    
    // Ensure the dedicated watch player container is present
    const playerContainer = document.querySelector('[data-uia="watch-video"], .watch-video');
    if (!playerContainer) {
      console.log('[ReWatch][Netflix] Missing watch-video container - likely an info page');
      return false;
    }

    const player = playerContainer.querySelector('[data-uia="player"], video');
    if (!player) {
      console.log('[ReWatch][Netflix] Player element missing inside watch-video container');
      return false;
    }

    
    return true;
  }
}

class VideoTracker {
  constructor() {
    this.videoElement = null;
    this.progressInterval = null;
    this.lastSavedTime = 0;
    this.saveThreshold = 10; // Save every 10 seconds of progress
    this.detectionAttempts = 0;
    this.maxDetectionAttempts = 10;
    this.platformDetector = null;
    this.boundOnPlay = this.onVideoPlay.bind(this);
    this.boundOnPause = this.onVideoPause.bind(this);
    this.boundOnTimeUpdate = this.onTimeUpdate.bind(this);
    this.boundOnEnded = this.onVideoEnded.bind(this);
    this.boundOnLoadedMetadata = () => this.handlePlaybackContextUpdate('loadedmetadata');
    this.boundOnDurationChange = () => this.handlePlaybackContextUpdate('durationchange');
    this.boundOnEmptied = () => this.handlePlaybackContextUpdate('emptied');
    this.resumeCheckTimeout = null;
    this.navigationListenersSetup = false;
    this.lastKnownUrl = window.location.href;
    this.lastMetadataSignature = null;
    this.pendingNavigationDetection = null;
    this.hasPerformedInitialResumeCheck = false;
    this.lastVideoSrc = null;
  }
  
  // Get the appropriate platform detector
  getPlatformDetector() {
    if (this.platformDetector) {
      return this.platformDetector;
    }
    
    const hostname = window.location.hostname;
    const detectors = [
      new HBOMaxDetector(hostname),
      new DisneyPlusDetector(hostname),
      new HiAnimeDetector(hostname),
      new NetflixDetector(hostname)
    ];
    
    for (const detector of detectors) {
      if (detector.canDetect()) {
        console.log('[ReWatch] Using platform detector:', detector.constructor.name);
        this.platformDetector = detector;
        return detector;
      }
    }
    
    console.log('[ReWatch] No specific platform detector found, using generic detection');
    return null;
  }

  // Initialize the tracker
  init() {
    console.log('[ReWatch] Initializing video tracker...');
    this.detectVideo();
    
    // Set up mutation observer to detect dynamically loaded videos
    this.setupMutationObserver();

    // Monitor SPA navigation so we refresh metadata without reload
    this.setupNavigationListeners();
  }

  setupNavigationListeners() {
    if (this.navigationListenersSetup || typeof window === 'undefined') {
      return;
    }

    this.navigationListenersSetup = true;
    this.lastKnownUrl = window.location.href;

    const handleUrlChange = (reason) => {
      try {
        const currentUrl = window.location.href;
        if (!currentUrl || currentUrl === this.lastKnownUrl) {
          return;
        }

        const previousUrl = this.lastKnownUrl;
        this.lastKnownUrl = currentUrl;
        console.log('[ReWatch] Navigation change detected:', { reason, previousUrl, currentUrl });
        this.handlePlaybackContextUpdate('navigation');
      } catch (error) {
        console.log('[ReWatch] Error handling navigation change:', error.message);
      }
    };

    try {
      window.addEventListener('popstate', () => handleUrlChange('popstate'));
      window.addEventListener('hashchange', () => handleUrlChange('hashchange'));
    } catch (error) {
      console.log('[ReWatch] Failed to attach popstate/hashchange listeners:', error.message);
    }

    const historyObject = window.history;

    const wrapHistoryMethod = (methodName) => {
      const original = historyObject && historyObject[methodName];
      if (typeof original !== 'function') {
        return;
      }

      try {
        historyObject[methodName] = (...args) => {
          const result = original.apply(historyObject, args);
          handleUrlChange(methodName);
          return result;
        };
      } catch (error) {
        console.log('[ReWatch] Failed to wrap history method:', methodName, error.message);
      }
    };

    try {
      wrapHistoryMethod('pushState');
      wrapHistoryMethod('replaceState');
    } catch (error) {
      console.log('[ReWatch] Unable to wrap history navigation methods:', error.message);
    }
  }

  scheduleResumeCheck(delay = 0) {
    if (this.resumeCheckTimeout) {
      clearTimeout(this.resumeCheckTimeout);
      this.resumeCheckTimeout = null;
    }

    const numericDelay = typeof delay === 'number' && Number.isFinite(delay) ? delay : 0;
    const normalizedDelay = Math.max(0, numericDelay);
    this.hasPerformedInitialResumeCheck = false;

    this.resumeCheckTimeout = setTimeout(() => {
      this.resumeCheckTimeout = null;
      if (!this.videoElement) {
        return;
      }
      this.checkSavedProgress();
      this.hasPerformedInitialResumeCheck = true;
    }, normalizedDelay);
  }

  handlePlaybackContextUpdate(reason) {
    cachedTitle = null;
    this.platformDetector = null;
    this.lastMetadataSignature = null;
    this.lastVideoSrc = this.videoElement && typeof this.videoElement.currentSrc === 'string'
      ? this.videoElement.currentSrc
      : null;
    this.lastSavedTime = 0;

    if (reason === 'navigation') {
      if (this.pendingNavigationDetection) {
        clearTimeout(this.pendingNavigationDetection);
        this.pendingNavigationDetection = null;
      }

      this.pendingNavigationDetection = setTimeout(() => {
        this.pendingNavigationDetection = null;
        this.detectionAttempts = 0;
        this.detectVideo();
      }, 800);

      this.scheduleResumeCheck(1200);
      return;
    }

    if (reason === 'loadedmetadata' || reason === 'durationchange') {
      this.scheduleResumeCheck(700);
      return;
    }

    if (reason === 'emptied') {
      return;
    }
  }

  detachCurrentVideo() {
    if (!this.videoElement) {
      return;
    }

    try { this.videoElement.removeEventListener('play', this.boundOnPlay); } catch (error) {
      console.log('[ReWatch] Error removing play listener:', error.message);
    }
    try { this.videoElement.removeEventListener('pause', this.boundOnPause); } catch (error) {
      console.log('[ReWatch] Error removing pause listener:', error.message);
    }
    try { this.videoElement.removeEventListener('timeupdate', this.boundOnTimeUpdate); } catch (error) {
      console.log('[ReWatch] Error removing timeupdate listener:', error.message);
    }
    try { this.videoElement.removeEventListener('ended', this.boundOnEnded); } catch (error) {
      console.log('[ReWatch] Error removing ended listener:', error.message);
    }
    try { this.videoElement.removeEventListener('loadedmetadata', this.boundOnLoadedMetadata); } catch (error) {
      console.log('[ReWatch] Error removing loadedmetadata listener:', error.message);
    }
    try { this.videoElement.removeEventListener('durationchange', this.boundOnDurationChange); } catch (error) {
      console.log('[ReWatch] Error removing durationchange listener:', error.message);
    }
    try { this.videoElement.removeEventListener('emptied', this.boundOnEmptied); } catch (error) {
      console.log('[ReWatch] Error removing emptied listener:', error.message);
    }

    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    if (this.resumeCheckTimeout) {
      clearTimeout(this.resumeCheckTimeout);
      this.resumeCheckTimeout = null;
    }

    this.hasPerformedInitialResumeCheck = false;

    this.videoElement = null;
  }

  _createMetadataSignature(metadata) {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const safeString = (value) => {
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'number') {
        return String(value);
      }
      return String(value).trim();
    };

    const parts = [
      safeString(metadata.platform).toLowerCase(),
      safeString(metadata.type).toLowerCase(),
      safeString(metadata.seriesTitle).toLowerCase(),
      safeString(metadata.title).toLowerCase(),
      safeString(metadata.episodeName).toLowerCase(),
      Number.isFinite(metadata.seasonNumber) ? `s${parseInt(metadata.seasonNumber, 10)}` : '',
      Number.isFinite(metadata.episodeNumber) ? `e${parseInt(metadata.episodeNumber, 10)}` : '',
      safeString(metadata.url).split('?')[0].toLowerCase()
    ];

    return parts.join('|');
  }

  // Detect video elements on the page
  detectVideo() {
    // Look for HTML5 video elements
    const videos = findAllVideoElements();

    console.log('[ReWatch] Found', videos.length, 'video element(s) (including shadow DOM)');

    const platformDetector = this.getPlatformDetector();
    const platformName = platformDetector && typeof platformDetector.getPlatformName === 'function'
      ? platformDetector.getPlatformName()
      : null;

    let candidateVideos = videos;

    if (platformDetector && typeof platformDetector.filterVideoElements === 'function') {
      try {
        const filtered = platformDetector.filterVideoElements(videos) || [];
        if (Array.isArray(filtered)) {
          candidateVideos = filtered;
          if (filtered.length !== videos.length) {
            console.log('[ReWatch] Filtered video candidates for', platformName || 'generic detector', ':', filtered.length, '/', videos.length);
          }
        }
      } catch (error) {
        console.log('[ReWatch] Error filtering video candidates:', error.message);
      }
    }

    if (!candidateVideos || candidateVideos.length === 0) {
      if (this.detectionAttempts < this.maxDetectionAttempts) {
        this.detectionAttempts++;
        console.log('[ReWatch] No playable video found yet, retry attempt', this.detectionAttempts, 'in 2 seconds...');
        setTimeout(() => this.detectVideo(), 2000);
      } else {
        console.log('[ReWatch] Max detection attempts reached, giving up');
      }
      return;
    }

    let mainVideo = null;

    if (platformDetector && typeof platformDetector.selectVideoElement === 'function') {
      try {
        mainVideo = platformDetector.selectVideoElement(candidateVideos);
      } catch (error) {
        console.log('[ReWatch] Error selecting platform-specific video candidate:', error.message);
      }
    }

    if (!mainVideo) {
      if (candidateVideos.length === 1) {
        mainVideo = candidateVideos[0];
      } else {
        mainVideo = candidateVideos.reduce((largest, video) => {
          if (!largest) {
            return video;
          }

          try {
            const largestRect = largest.getBoundingClientRect();
            const videoRect = video.getBoundingClientRect();
            const largestArea = Math.max(0, largestRect.width) * Math.max(0, largestRect.height);
            const videoArea = Math.max(0, videoRect.width) * Math.max(0, videoRect.height);
            return videoArea > largestArea ? video : largest;
          } catch (error) {
            console.log('[ReWatch] Error comparing video candidates:', error.message);
            return largest;
          }
        }, null);
      }
    }

    if (!mainVideo) {
      if (this.detectionAttempts < this.maxDetectionAttempts) {
        this.detectionAttempts++;
        console.log('[ReWatch] Candidate selection returned no video, retry attempt', this.detectionAttempts, 'in 2 seconds...');
        setTimeout(() => this.detectVideo(), 2000);
      } else {
        console.log('[ReWatch] Max detection attempts reached, giving up');
      }
      return;
    }

    try {
      const rect = mainVideo.getBoundingClientRect();
      console.log('[ReWatch] Selected video:', mainVideo, 'Size:', Math.round(rect.width), 'x', Math.round(rect.height));
    } catch (error) {
      console.log('[ReWatch] Selected video but failed to measure size:', error.message);
    }

    this.attachToVideo(mainVideo);
  }

  // Set up mutation observer to detect videos loaded after page load
  setupMutationObserver() {
    const observer = new MutationObserver(() => {
      if (!this.videoElement || !document.contains(this.videoElement)) {
        this.detectVideo();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Attach event listeners to the video element
  attachToVideo(video) {
    if (!video) {
      return;
    }

    if (this.videoElement === video) {
      console.log('[ReWatch] Already attached to this video');
      return;
    }
    
    this.detachCurrentVideo();
    this.detectionAttempts = 0;
    cachedTitle = null;
    this.videoElement = video;
    this.lastVideoSrc = typeof video.currentSrc === 'string' ? video.currentSrc : null;
    console.log('[ReWatch] Attaching to video element');

    video.addEventListener('play', this.boundOnPlay);
    video.addEventListener('pause', this.boundOnPause);
    video.addEventListener('timeupdate', this.boundOnTimeUpdate);
    video.addEventListener('ended', this.boundOnEnded);
    video.addEventListener('loadedmetadata', this.boundOnLoadedMetadata);
    video.addEventListener('durationchange', this.boundOnDurationChange);
    video.addEventListener('emptied', this.boundOnEmptied);

    console.log('[ReWatch] Event listeners attached successfully');

    // Check if there's saved progress for this video
    // For iframes, wait a moment to receive parent URL via postMessage
    const delay = (window.self !== window.top) ? 500 : 0;
    this.scheduleResumeCheck(delay);
  }

  // Extract video metadata from the page
  extractMetadata() {
    // Check if we're in an iframe
    const isInIframe = window.self !== window.top;
    let pageUrl = window.location.href;
    
    // If in iframe, try to get parent URL (for embedded players)
    if (isInIframe) {
      try {
        // Try to access parent URL (will fail if cross-origin)
        pageUrl = window.top.location.href;
        console.log('[ReWatch] In iframe, using parent URL:', pageUrl);
      } catch (e) {
        // Cross-origin iframe - try multiple fallback methods
        console.log('[ReWatch] Cross-origin iframe detected');
        
        // Method 1: Check if parent URL was cached by our listener
        if (window.ReWatchParentUrl) {
          pageUrl = window.ReWatchParentUrl;
          console.log('[ReWatch] Using cached parent URL:', pageUrl);
        }
        // Method 2: Use referrer (may be incomplete)
        else if (document.referrer && document.referrer !== window.location.origin + '/') {
          pageUrl = document.referrer;
          console.log('[ReWatch] Using referrer:', pageUrl);
        }
        // Method 3: Use iframe URL as last resort
        else {
          console.log('[ReWatch] No parent URL available, using iframe URL');
        }
      }
    }
    
    const platformDetector = this.getPlatformDetector();
    const platformContentType = (platformDetector && typeof platformDetector.getContentType === 'function')
      ? platformDetector.getContentType()
      : null;
    const platformName = platformDetector && typeof platformDetector.getPlatformName === 'function'
      ? platformDetector.getPlatformName()
      : null;

    const metadata = {
      title: this.extractTitle(),
      url: pageUrl,
      platform: platformName || this.detectPlatform(pageUrl),
      type: platformContentType || 'movie', // Default, will adjust below if we find episode info
      isIframe: isInIframe
    };

    if (metadata.title) {
      metadata.originalTitle = metadata.title;
    }

    // Try to extract episode and season numbers
    // If we find them, we know it's an episode
    const episodeNum = this.extractEpisodeNumber();
    const seasonNum = this.extractSeasonNumber();
    
    if (episodeNum !== null || seasonNum !== null) {
      // We found episode/season info, so it's definitely an episode
      metadata.type = 'episode';
      
      if (Number.isFinite(episodeNum)) {
        metadata.episodeNumber = parseInt(episodeNum, 10);
      }
      
      if (Number.isFinite(seasonNum)) {
        metadata.seasonNumber = parseInt(seasonNum, 10);
      }
    } else if (platformContentType) {
      metadata.type = platformContentType;
    }

    let inferredFromTitle = null;
    if (platformDetector && metadata.title) {
      inferredFromTitle = platformDetector.inferEpisodeInfoFromTitle(metadata.title);
      if (inferredFromTitle) {
        if (metadata.type !== 'episode') {
          metadata.type = 'episode';
        }
        if (metadata.episodeNumber === undefined && Number.isFinite(inferredFromTitle.episode)) {
          metadata.episodeNumber = parseInt(inferredFromTitle.episode, 10);
        }
        if (metadata.seasonNumber === undefined && Number.isFinite(inferredFromTitle.season)) {
          metadata.seasonNumber = parseInt(inferredFromTitle.season, 10);
        }
      }
    }

    // Try to extract episode name using platform detector if available
    if (platformDetector) {
      const episodeName = platformDetector.extractEpisodeName();
      if (episodeName) {
        metadata.episodeName = episodeName;
        if (metadata.type !== 'episode') {
          metadata.type = 'episode';
        }
      }
    }

    if (
      metadata.platform === 'Netflix' &&
      metadata.type !== 'episode' &&
      platformDetector &&
      typeof platformDetector.getCurrentVideoEntry === 'function'
    ) {
      const currentEntry = platformDetector.getCurrentVideoEntry();
      const entrySummary = currentEntry?.videoEntry?.summary?.value;
      if (entrySummary && (Number.isFinite(entrySummary.episode) || Number.isFinite(entrySummary.season))) {
        metadata.type = 'episode';
        if (metadata.episodeNumber === undefined && Number.isFinite(entrySummary.episode)) {
          metadata.episodeNumber = parseInt(entrySummary.episode, 10);
         }
         if (metadata.seasonNumber === undefined && Number.isFinite(entrySummary.season)) {
           metadata.seasonNumber = parseInt(entrySummary.season, 10);
         }
      }
    }

    if (platformDetector && metadata.type !== 'episode') {
      const refreshedType = platformDetector.getContentType();
      if (refreshedType === 'episode') {
        metadata.type = 'episode';
      }
    }

    if (
      metadata.type !== 'episode' &&
      (
        Number.isFinite(metadata.episode) ||
        Number.isFinite(metadata.season) ||
        (typeof metadata.episodeName === 'string' && metadata.episodeName.trim().length > 0)
      )
    ) {
      metadata.type = 'episode';
    }

    if (metadata.type === 'episode') {
      if (!metadata.seriesTitle) {
        const inferredSeries = inferredFromTitle?.seriesTitle;
        if (inferredSeries) {
          metadata.seriesTitle = inferredSeries;
        } else if (metadata.showTitle) {
          metadata.seriesTitle = metadata.showTitle;
        } else if (metadata.series) {
          metadata.seriesTitle = metadata.series;
        }
      }

      if (!metadata.episodeName && inferredFromTitle?.episodeName) {
        metadata.episodeName = inferredFromTitle.episodeName;
      }

      if (metadata.seriesTitle) {
        if (!metadata.title || metadata.title !== metadata.seriesTitle) {
          metadata.title = metadata.seriesTitle;
        }
      }

      if (!metadata.originalTitle && metadata.title) {
        metadata.originalTitle = metadata.title;
      }
    }

    console.log('[ReWatch] Extracted metadata:', metadata);
    return metadata;
  }

  // Extract title from various sources
  extractTitle() {
    // If we're on the main page and getPageTitle exists (Netflix, etc.), use it
    if (window.self === window.top && typeof getPageTitle === 'function') {
      const title = getPageTitle();
      console.log('[ReWatch] Using getPageTitle():', title);
      return title;
    }
    
    // If in iframe and we have parent title cached, use it
    if (window.self !== window.top && window.ReWatchParentTitle) {
      console.log('[ReWatch] Using cached parent title:', window.ReWatchParentTitle);
      return window.ReWatchParentTitle;
    }
    
    // Try platform-specific detector
    const platformDetector = this.getPlatformDetector();
    if (platformDetector) {
      const title = platformDetector.extractTitle();
      if (title) {
        return title;
      }
    }
    
    // Generic fallback
    return this.genericExtractTitle();
  }
  
  // Generic title extraction for platforms without specific detectors
  genericExtractTitle() {
    // List of generic/unwanted titles to skip
    const unwantedTitles = [
      'privacy preference center',
      'cookie preferences',
      'sign in',
      'login',
      'register',
      'home',
      'watch',
      'loading',
      'error'
    ];
    
    // Try common title selectors
    const selectors = [
      'h1',
      '[class*="title"]',
      '[class*="Title"]',
      '[data-testid*="title"]',
      'meta[property="og:title"]',
      'title'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const title = element.content || element.textContent;
        if (title && title.trim().length > 0) {
          const titleLower = title.trim().toLowerCase();
          
          // Skip unwanted generic titles
          if (unwantedTitles.some(unwanted => titleLower.includes(unwanted))) {
            continue;
          }
          
          return title.trim();
        }
      }
    }

    return document.title || 'Unknown Title';
  }

  // Detect the streaming platform
  detectPlatform(url = null) {
    const detector = this.getPlatformDetector();
    if (detector && typeof detector.getPlatformName === 'function') {
      const name = detector.getPlatformName();
      if (name) {
        return name;
      }
    }

    if (!url) {
      return null;
    }

    let hostname;
    try {
      hostname = new URL(url).hostname;
    } catch (error) {
      console.log('[ReWatch] Unable to parse URL for platform detection:', error.message);
      return null;
    }

    const normalized = hostname.toLowerCase();

    if (normalized.includes('netflix')) {
      return 'Netflix';
    }

    if (normalized.includes('disneyplus')) {
      return 'Disney+';
    }

    if (normalized.includes('hianime') || normalized.includes('aniwatch')) {
      return 'HiAnime';
    }

    if (normalized.includes('hbomax') || normalized.endsWith('max.com') || normalized.includes('.max.com')) {
      return 'HBO Max';
    }

    if (normalized.includes('hbo.')) {
      return 'HBO Max';
    }

    return null;
  }

  // Extract episode number from the page
  extractEpisodeNumber() {
    // If in iframe and we have parent episode number cached, use it
    if (window.self !== window.top && window.ReWatchParentEpisode !== undefined) {
      console.log('[ReWatch] Using cached parent episode number:', window.ReWatchParentEpisode);
      return window.ReWatchParentEpisode;
    }
    
    // Try platform-specific detector first
    const platformDetector = this.getPlatformDetector();
    if (platformDetector) {
      const episodeNum = platformDetector.extractEpisodeNumber();
      if (episodeNum !== null) {
        return episodeNum;
      }
      // For platforms with detectors, if they return null, trust that
      return null;
    }
    
    // Generic fallback for platforms without specific detectors
    return this.genericExtractEpisodeNumber();
  }
  
  // Generic episode extraction for platforms without specific detectors
  genericExtractEpisodeNumber() {
    // Check for parent URL if in iframe
    let parentUrl = null;
    if (window.self !== window.top && window.ReWatchParentUrl) {
      try {
        parentUrl = new URL(window.ReWatchParentUrl);
      } catch (e) {
        console.log('[ReWatch] Could not parse parent URL');
      }
    }
    
    const sources = [
      // Look for episode number in highlighted/active episode
      () => {
        const activeEp = document.querySelector('.ep-item.active, .episode-item.active, [class*="episode"][class*="active"]');
        if (activeEp) {
          const match = activeEp.textContent.match(/(\d+)/);
          if (match) {
            console.log('[ReWatch] Found episode from active element:', match[1]);
            return match[1];
          }
        }
        return null;
      },
      // Look in URL path
      () => {
        const urlPath = (parentUrl || window.location).pathname;
        const patterns = [
          /episode[_-]?(\d+)/i,
          /ep[_-]?(\d+)/i,
          /\/e(\d+)/i
        ];
        
        for (const pattern of patterns) {
          const match = urlPath.match(pattern);
          if (match) {
            console.log('[ReWatch] Found episode from URL:', match[1]);
            return match[1];
          }
        }
        return null;
      }
    ];
    
    for (const source of sources) {
      const episodeNum = source();
      if (episodeNum) {
        return parseInt(episodeNum);
      }
    }
    
    console.log('[ReWatch] Could not detect episode number');
    return null;
  }

  // Extract season number from the page
  extractSeasonNumber() {
    // If in iframe and we have parent season number cached, use it
    if (window.self !== window.top && window.ReWatchParentSeason !== undefined) {
      console.log('[ReWatch] Using cached parent season number:', window.ReWatchParentSeason);
      return window.ReWatchParentSeason;
    }
    
    // Try platform-specific detector first
    const platformDetector = this.getPlatformDetector();
    if (platformDetector) {
      const seasonNum = platformDetector.extractSeasonNumber();
      if (seasonNum !== null) {
        return seasonNum;
      }
      // For platforms with detectors, if they return null, trust that
      return null;
    }
    
    // Generic fallback for platforms without specific detectors
    return this.genericExtractSeasonNumber();
  }
  
  // Generic season extraction for platforms without specific detectors
  genericExtractSeasonNumber() {
    const sources = [
      // Parse from URL path
      () => {
        const urlPath = window.location.pathname;
        const patterns = [
          /season[_-]?(\d+)/i,
          /s(\d+)e\d+/i  // S1E2 format in URL
        ];
        
        for (const pattern of patterns) {
          const match = urlPath.match(pattern);
          if (match && parseInt(match[1]) > 0) {
            console.log('[ReWatch] Found season from URL:', match[1]);
            return match[1];
          }
        }
        return null;
      },
      
      // Search for "Season X" in title only (not entire page)
      () => {
        const title = this.extractTitle();
        const patterns = [
          /Season\s+(\d+)/i,
          /Series\s+(\d+)/i
        ];
        
        for (const pattern of patterns) {
          const match = title.match(pattern);
          if (match && parseInt(match[1]) > 0) {
            console.log('[ReWatch] Found season from title:', match[1]);
            return match[1];
          }
        }
        return null;
      }
    ];
    
    // Try each source
    for (const source of sources) {
      const seasonNum = source();
      if (seasonNum) {
        return parseInt(seasonNum);
      }
    }
    
    console.log('[ReWatch] Could not detect season number');
    return null;
  }

  // Handle video play event
  onVideoPlay() {
    console.log('[ReWatch] Video playing');
    
    // Start tracking progress periodically
    this.progressInterval = setInterval(() => {
      this.saveProgress();
    }, 5000); // Save every 5 seconds
  }

  // Handle video pause event
  onVideoPause() {
    console.log('[ReWatch] Video paused');
    
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    
    // Save progress on pause
    this.saveProgress();
  }

  // Handle time update event
  onTimeUpdate() {
    if (!this.videoElement) return;
    
    const currentTime = this.videoElement.currentTime;
    
    // Save progress if we've moved forward significantly
    if (Math.abs(currentTime - this.lastSavedTime) >= this.saveThreshold) {
      this.saveProgress();
    }
  }

  // Handle video ended event
  onVideoEnded() {
    console.log('[ReWatch] Video ended');
    this.saveProgress(true);
  }

  // Save progress to storage
  saveProgress(completed = false) {
    if (!this.videoElement) {
      console.log('[ReWatch] Cannot save progress - no video element');
      return;
    }

    const currentTime = this.videoElement.currentTime;
    const duration = this.videoElement.duration;
    const currentSrc = typeof this.videoElement.currentSrc === 'string' ? this.videoElement.currentSrc : null;

    if (currentSrc && this.lastVideoSrc !== currentSrc) {
      console.log('[ReWatch] Video source updated:', {
        previous: this.lastVideoSrc,
        current: currentSrc
      });
      this.lastVideoSrc = currentSrc;
      this.lastMetadataSignature = null;
    }

    console.log('[ReWatch] Attempting to save progress:', {
      currentTime,
      duration,
      completed
    });

    // Don't save if no meaningful progress
    if (currentTime < 1 || duration < 1) {
      console.log('[ReWatch] Skipping save - insufficient progress or duration');
      return;
    }

    const platformDetector = this.getPlatformDetector();
    const detectedPlatformName = platformDetector && typeof platformDetector.getPlatformName === 'function'
      ? platformDetector.getPlatformName()
      : null;

    const metadata = this.extractMetadata();

    if (!metadata) {
      console.log('[ReWatch] Skipping save - metadata unavailable');
      return;
    }

    const effectivePlatform = metadata.platform || detectedPlatformName;
    const enforcePlatformRestrictions = effectivePlatform !== 'Disney+';

    if (enforcePlatformRestrictions && Number.isFinite(duration) && duration < MINIMUM_CLIP_DURATION_SECONDS) {
      console.log('[ReWatch] Skipping save - duration below minimum threshold');
      return;
    }

    if (enforcePlatformRestrictions && platformDetector && !platformDetector.isValidPlaybackPage()) {
      console.log('[ReWatch] Not a valid playback page - skipping save');
      return;
    }

    if (!metadata.platform || !SUPPORTED_PLATFORM_NAMES.includes(metadata.platform)) {
      console.log('[ReWatch] Skipping unsupported platform:', metadata.platform || 'Unknown');
      return;
    }

    if (effectivePlatform === 'Disney+') {
      let metadataPath = '';
      try {
        const metadataUrlObject = new URL(metadata.url || window.location.href);
        metadataPath = metadataUrlObject.pathname || '';
      } catch (error) {
        console.log('[ReWatch][Disney+] Could not parse metadata URL for playback validation:', error.message);
      }

      const isPlaybackRoute = /\/video\//i.test(metadataPath) || /\/play\//i.test(metadataPath);

      if (!isPlaybackRoute) {
        console.log('[ReWatch][Disney+] Skipping save - non-playback route detected:', metadataPath);
        return;
      }
    }

    if (metadata && typeof metadata.type === 'string') {
      const normalizedType = metadata.type.toLowerCase();
      if (!['movie', 'episode'].includes(normalizedType)) {
        console.log('[ReWatch] Skipping unsupported content type:', metadata.type);
        return;
      }
    }

    if (metadata && metadata.platform === 'Netflix' && metadata.title && metadata.title.trim().toLowerCase() === 'general description') {
      console.log('[ReWatch] Skipping Netflix general description preview');
      return;
    }

    const metadataSignature = this._createMetadataSignature(metadata);
    if (metadataSignature && metadataSignature !== this.lastMetadataSignature) {
      const previousSignature = this.lastMetadataSignature;
      this.lastMetadataSignature = metadataSignature;

      if (previousSignature !== null) {
        console.log('[ReWatch] Playback metadata changed:', {
          previousSignature,
          metadataSignature
        });
        this.scheduleResumeCheck(800);
      }
    }

    const progressData = {
      ...metadata,
      currentTime: completed ? duration : currentTime,
      duration: duration
    };

    console.log('[ReWatch] Saving progress data:', progressData);

    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      console.log('[ReWatch] Extension context invalidated - skipping save');
      return;
    }

    // Send to background script
    try {
      chrome.runtime.sendMessage({
        action: 'saveProgress',
        data: progressData
      }, (response) => {
        if (chrome.runtime.lastError) {
          // Extension was reloaded or disabled
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            console.log('[ReWatch] Extension was reloaded - stopping tracker');
            if (this.progressInterval) {
              clearInterval(this.progressInterval);
            }
            return;
          }
          console.error('[ReWatch] Error sending message:', chrome.runtime.lastError);
          return;
        }
        if (response && response.success) {
          this.lastSavedTime = currentTime;
          console.log('[ReWatch] Progress saved successfully!');
        } else {
          console.error('[ReWatch] Failed to save progress:', response);
        }
      });
    } catch (e) {
      console.log('[ReWatch] Error saving progress (extension may be reloading):', e.message);
    }
  }

  // Check for saved progress and offer to resume
  async checkSavedProgress() {
    if (!this.videoElement) return;

    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      console.log('[ReWatch] Extension context invalidated - skipping resume check');
      return;
    }

    try {
      chrome.runtime.sendMessage({
        action: 'getProgress',
        url: window.location.href
      }, (response) => {
        if (chrome.runtime.lastError) {
          // Extension was reloaded or disabled
          console.log('[ReWatch] Could not check saved progress:', chrome.runtime.lastError.message);
          return;
        }
        if (response && response.success && response.data) {
          const { currentTime, percentComplete } = response.data;
          
          // Only prompt if there's meaningful progress and not near the end
          if (currentTime > 30 && percentComplete < 95) {
            this.promptResume(currentTime);
          }
        }
      });
    } catch (e) {
      console.log('[ReWatch] Error checking saved progress:', e.message);
    }
  }

  // Prompt user to resume from saved position
  promptResume(savedTime) {
    // Create a simple overlay prompt
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      z-index: 999999;
      font-family: Arial, sans-serif;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    `;

    const minutes = Math.floor(savedTime / 60);
    const seconds = Math.floor(savedTime % 60);
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    overlay.innerHTML = `
      <div style="margin-bottom: 10px;">Resume from ${timeString}?</div>
      <button id="wg-resume" style="
        background: #4CAF50;
        color: white;
        border: none;
        padding: 8px 16px;
        margin-right: 10px;
        border-radius: 4px;
        cursor: pointer;
      ">Resume</button>
      <button id="wg-start-over" style="
        background: #f44336;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      ">Start Over</button>
    `;

    document.body.appendChild(overlay);

    // Handle resume button
    document.getElementById('wg-resume').addEventListener('click', () => {
      this.videoElement.currentTime = savedTime;
      overlay.remove();
    });

    // Handle start over button
    document.getElementById('wg-start-over').addEventListener('click', () => {
      overlay.remove();
    });

    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.remove();
      }
    }, 10000);
  }
}

// Global tracker instance
let globalTracker = null;

// Initialize tracker when page loads
function initializeTracker() {
  console.log('[ReWatch] Initializing video tracker... Document ready state:', document.readyState);
  
  if (!globalTracker) {
    globalTracker = new VideoTracker();
    globalTracker.init();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeTracker);
} else {
  initializeTracker();
}

// Also try after window load (fallback)
window.addEventListener('load', () => {
  console.log('[ReWatch] Window loaded, checking for tracker...');
  if (!globalTracker) {
    initializeTracker();
  } else if (!globalTracker.videoElement) {
    // Tracker exists but no video found, try again
    console.log('[ReWatch] Tracker exists but no video, retrying detection...');
    globalTracker.detectVideo();
  }
});
