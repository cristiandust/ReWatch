(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const { PlatformDetector } = root.core;

  class TubiDetector extends PlatformDetector {
    canDetect() {
      return /(^|\.)tubitv\.com$/i.test(this.hostname);
    }

    getPlatformName() {
      return 'Tubi';
    }

    filterVideoElements(videoElements) {
      if (!Array.isArray(videoElements)) {
        return [];
      }

      return videoElements.filter((video) => {
        if (!video) {
          return false;
        }

        const parent = video.closest('[data-testid="ad-player"], [data-testid="adPlayer"], .ads, .ad-container');
        if (parent) {
          return false;
        }

        const className = Array.from(video.classList || []).join(' ').toLowerCase();
        if (className.includes('ad') && !className.includes('main')) {
          return false;
        }

        const duration = Number.isFinite(video.duration) ? video.duration : NaN;
        if (Number.isFinite(duration) && duration > 0 && duration < 60) {
          return false;
        }

        return true;
      });
    }

    selectVideoElement(videoElements) {
      if (!Array.isArray(videoElements) || !videoElements.length) {
        return null;
      }

      return videoElements.reduce((selected, candidate) => {
        if (!candidate) {
          return selected;
        }
        if (!selected) {
          return candidate;
        }

        const candidateDuration = Number.isFinite(candidate.duration) ? candidate.duration : 0;
        const selectedDuration = Number.isFinite(selected.duration) ? selected.duration : 0;

        if (candidateDuration !== selectedDuration) {
          return candidateDuration > selectedDuration ? candidate : selected;
        }

        try {
          const candidateRect = candidate.getBoundingClientRect();
          const selectedRect = selected.getBoundingClientRect();
          const candidateArea = Math.max(0, candidateRect.width) * Math.max(0, candidateRect.height);
          const selectedArea = Math.max(0, selectedRect.width) * Math.max(0, selectedRect.height);
          return candidateArea >= selectedArea ? candidate : selected;
        } catch (_error) {
          return candidate;
        }
      }, null);
    }

    extractTitle() {
      const selectors = [
        '[data-testid="videoTitle"]',
        'h1[data-testid="title"]',
        'meta[property="og:title"]',
        'meta[name="title"]',
        'title'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (!element) {
          continue;
        }
        const text = element.content || element.textContent || '';
        const cleaned = text.replace(/\s*\|\s*Tubi$/i, '').trim();
        if (cleaned) {
          return cleaned;
        }
      }

      return null;
    }

    extractEpisodeName() {
      const subtitle = document.querySelector('[data-testid="videoSubtitle"], [data-testid="videoSubTitle"]');
      if (subtitle && subtitle.textContent) {
        const text = subtitle.textContent.trim();
        if (text.length && !/Season\s+\d+/i.test(text)) {
          return text;
        }
      }
      return null;
    }

    extractEpisodeNumber() {
      const url = window.location.pathname;
      const match = url.match(/s(\d+)-e(\d+)/i) || url.match(/episode-(\d+)/i);
      if (match) {
        const episode = match[2] || match[1];
        const parsed = parseInt(episode, 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }

      const episodeEl = document.querySelector('[data-testid="episodeNumber"], .episode-number');
      if (episodeEl && episodeEl.textContent) {
        const episodeMatch = episodeEl.textContent.match(/\d+/);
        if (episodeMatch) {
          return parseInt(episodeMatch[0], 10);
        }
      }

      return null;
    }

    extractSeasonNumber() {
      const url = window.location.pathname;
      const match = url.match(/s(\d+)-e\d+/i);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }

      const seasonEl = document.querySelector('[data-testid="seasonNumber"], .season-number');
      if (seasonEl && seasonEl.textContent) {
        const seasonMatch = seasonEl.textContent.match(/\d+/);
        if (seasonMatch) {
          return parseInt(seasonMatch[0], 10);
        }
      }

      return null;
    }

    getContentType() {
      const path = window.location.pathname || '';
      if (/\/series\//i.test(path) || /s\d+-e\d+/i.test(path)) {
        return 'episode';
      }
      return 'movie';
    }

    isValidPlaybackPage() {
      const path = window.location.pathname || '';
      if (!/\/videos\//i.test(path) && !/\/series\//i.test(path) && !/\/movies\//i.test(path)) {
        return false;
      }

      const titleExists = Boolean(document.querySelector('[data-testid="videoTitle"], h1[data-testid="title"]'));
      const hasPlayableVideo = Array.from(document.querySelectorAll('video')).some((video) => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        return duration === 0 || duration > 60;
      });

      return titleExists && hasPlayableVideo;
    }
  }

  root.platformRegistry.registerDetector((hostname) => new TubiDetector(hostname));
})();
