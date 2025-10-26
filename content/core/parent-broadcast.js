(() => {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.self !== window.top) {
    return;
  }

  const root = window.ReWatch;
  const titleModule = root.core.title;

  const startTitleObserver = () => {
    if (titleModule.getTitleObserver()) {
      return;
    }

    const observer = new MutationObserver(() => {
      const previous = titleModule.getCachedTitle();
      titleModule.resetCachedTitle();
      const updated = titleModule.getPageTitle();

      if (updated !== previous && updated !== 'Netflix Content' && updated !== 'Unknown Title') {
        console.log('[ReWatch Parent] Title updated:', updated);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    titleModule.setTitleObserver(observer);
    console.log('[ReWatch Parent] Title observer started');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTitleObserver);
  } else {
    startTitleObserver();
  }

  setTimeout(() => {
    titleModule.resetCachedTitle();
    titleModule.getPageTitle();
  }, 2000);

  const getEpisodeNumber = () => {
    const methods = [
      () => {
        if (window.location.hostname.includes('hbo') || window.location.hostname.includes('max')) {
          const seasonEpisodeEl = document.querySelector('[data-testid="player-ux-season-episode"]');
          if (seasonEpisodeEl) {
            const text = seasonEpisodeEl.textContent.trim();
            const match = text.match(/S\s*\d+\s*E\s*(\d+)/i);
            if (match) {
              console.log('[ReWatch Parent] Found HBO Max episode from dedicated element:', match[1]);
              return parseInt(match[1], 10);
            }
          }
          console.log('[ReWatch Parent] HBO Max: No season-episode element found, not a series');
          return null;
        }
        return null;
      },
      () => {
        if (window.location.hostname.includes('hbo') || window.location.hostname.includes('max')) {
          return null;
        }

        const bodyText = document.body.textContent;
        const patterns = [
          /\bS\s*\d+\s*E\s*(\d+)\b/i,
          /Season\s+\d+\s+Episode\s+(\d+)/i,
          /(?:You are watching|Now Playing|Current)[^\d]*Episode\s+(\d+)/i,
          /Episode\s+(\d+)/i,
          /Ep\.?\s+(\d+)/i
        ];

        for (const pattern of patterns) {
          const match = bodyText.match(pattern);
          if (match) {
            console.log('[ReWatch Parent] Found episode from text:', match[1]);
            return parseInt(match[1], 10);
          }
        }
        return null;
      },
      () => {
        const activeSelectors = [
          '.ep-item.active',
          '.episode-item.active',
          '[class*="episode"].active',
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
              return parseInt(match[1], 10);
            }
          }
        }
        return null;
      },
      () => {
        const urlParams = new URLSearchParams(window.location.search);
        const possibleParams = ['ep', 'episode', 'episodeId', 'e'];

        for (const param of possibleParams) {
          const value = urlParams.get(param);
          if (!value) {
            continue;
          }
          const match = value.match(/(\d+)/);
          if (match) {
            console.log('[ReWatch Parent] Found episode from URL param:', match[1]);
            return parseInt(match[1], 10);
          }
        }
        return null;
      },
      () => {
        const urlPath = window.location.pathname;
        const patterns = [
          /episode[_-]?(\d+)/i,
          /ep[_-]?(\d+)/i,
          /\/e(\d+)\b/i,
          /\/(\d+)$/
        ];

        for (const pattern of patterns) {
          const match = urlPath.match(pattern);
          if (match) {
            console.log('[ReWatch Parent] Found episode from URL path:', match[1]);
            return parseInt(match[1], 10);
          }
        }
        return null;
      },
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
              return parseInt(match[1], 10);
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

  const getSeasonNumber = () => {
    const methods = [
      () => {
        if (window.location.hostname.includes('hbo') || window.location.hostname.includes('max')) {
          const seasonEpisodeEl = document.querySelector('[data-testid="player-ux-season-episode"]');
          if (seasonEpisodeEl) {
            const text = seasonEpisodeEl.textContent.trim();
            const match = text.match(/S\s*(\d+)\s*E\s*\d+/i);
            if (match) {
              console.log('[ReWatch Parent] Found HBO Max season from dedicated element:', match[1]);
              return parseInt(match[1], 10);
            }
          }
          console.log('[ReWatch Parent] HBO Max: No season-episode element found, not a series');
          return null;
        }
        return null;
      },
      () => {
        if (window.location.hostname.includes('hbo') || window.location.hostname.includes('max')) {
          return null;
        }

        const bodyText = document.body.textContent;
        const patterns = [
          /Season\s+(\d+)/i,
          /Series\s+(\d+)/i,
          /\bS\s*(\d+)\s*E\s*\d+\b/i,
          /\bS(\d+)E\d+\b/i
        ];

        for (const pattern of patterns) {
          const match = bodyText.match(pattern);
          if (match && parseInt(match[1], 10) > 0) {
            console.log('[ReWatch Parent] Found season from text:', match[1]);
            return parseInt(match[1], 10);
          }
        }
        return null;
      },
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
          if (match && parseInt(match[1], 10) > 0) {
            console.log('[ReWatch Parent] Found season from URL:', match[1]);
            return parseInt(match[1], 10);
          }
        }
        return null;
      },
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
            if (match && parseInt(match[1], 10) > 0) {
              console.log('[ReWatch Parent] Found season from meta tag:', match[1]);
              return parseInt(match[1], 10);
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
      const pageInfo = {
        type: 'ReWatch_PARENT_INFO',
        url: window.location.href,
        title: titleModule.getPageTitle(),
        episodeNumber: getEpisodeNumber(),
        seasonNumber: getSeasonNumber()
      };
      event.source.postMessage(pageInfo, '*');
      console.log('[ReWatch] Sent parent info to iframe:', pageInfo);
    }
  });
})();
