(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const { PlatformDetector } = root.core;

  class PlutoTVDetector extends PlatformDetector {
    canDetect() {
      return /(^|\.)pluto\.tv$/i.test(this.hostname);
    }

    getPlatformName() {
      return 'Pluto TV';
    }

    filterVideoElements(videoElements) {
      if (!Array.isArray(videoElements)) {
        return [];
      }

      return videoElements.filter((video) => {
        if (!video) {
          return false;
        }

        const parent = video.closest('.ad-container, [data-testid="ad-player"], .pluto-ad');
        if (parent) {
          return false;
        }

        const duration = Number.isFinite(video.duration) ? video.duration : NaN;
        if (Number.isFinite(duration) && duration > 0 && duration < 90) {
          return false;
        }

        return true;
      });
    }

    selectVideoElement(videoElements) {
      if (!Array.isArray(videoElements) || !videoElements.length) {
        return null;
      }

      if (videoElements.length === 1) {
        return videoElements[0];
      }

      return videoElements.reduce((selected, candidate) => {
        if (!candidate) {
          return selected;
        }
        if (!selected) {
          return candidate;
        }

        try {
          const candidateRect = candidate.getBoundingClientRect();
          const selectedRect = selected.getBoundingClientRect();
          const candidateArea = Math.max(0, candidateRect.width) * Math.max(0, candidateRect.height);
          const selectedArea = Math.max(0, selectedRect.width) * Math.max(0, selectedRect.height);
          if (candidateArea !== selectedArea) {
            return candidateArea > selectedArea ? candidate : selected;
          }
        } catch (_error) {
          // ignore
        }

        const candidateDuration = Number.isFinite(candidate.duration) ? candidate.duration : 0;
        const selectedDuration = Number.isFinite(selected.duration) ? selected.duration : 0;
        return candidateDuration >= selectedDuration ? candidate : selected;
      }, null);
    }

    extractTitle() {
      const selectors = [
        '[data-qa="title"]',
        '[data-testid="vod-title"]',
        'h1',
        'meta[property="og:title"]',
        'title'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (!element) {
          continue;
        }

        const text = element.content || element.textContent || '';
        const cleaned = text.replace(/\s*\|\s*Pluto\s*TV$/i, '').trim();
        if (cleaned) {
          return cleaned;
        }
      }

      return null;
    }

    extractEpisodeName() {
      const subtitle = document.querySelector('[data-testid="episode-title"], [data-qa="episode-title"], .episode-title');
      if (subtitle && subtitle.textContent) {
        const text = subtitle.textContent.trim();
        if (text && text.length < 200) {
          return text;
        }
      }
      return null;
    }

    extractEpisodeNumber() {
      const path = window.location.pathname || '';
      const match = path.match(/s(\d+)e(\d+)/i) || path.match(/episode-(\d+)/i);
      if (match) {
        const episode = match[2] || match[1];
        const parsed = parseInt(episode, 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }

      const label = document.querySelector('[data-testid="episode-number"], .episode-number');
      if (label && label.textContent) {
        const labelMatch = label.textContent.match(/Episode\s*(\d+)/i) || label.textContent.match(/\bE(\d+)\b/i);
        if (labelMatch) {
          return parseInt(labelMatch[1], 10);
        }
      }

      return null;
    }

    extractSeasonNumber() {
      const path = window.location.pathname || '';
      const match = path.match(/s(\d+)e\d+/i);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }

      const label = document.querySelector('[data-testid="season-number"], .season-number');
      if (label && label.textContent) {
        const labelMatch = label.textContent.match(/Season\s*(\d+)/i) || label.textContent.match(/\bS(\d+)\b/i);
        if (labelMatch) {
          return parseInt(labelMatch[1], 10);
        }
      }

      return null;
    }

    getContentType() {
      const path = window.location.pathname || '';
      if (/\/on-demand\/series\//i.test(path) || /s\d+e\d+/i.test(path)) {
        return 'episode';
      }
      return 'movie';
    }

    isValidPlaybackPage() {
      const path = window.location.pathname || '';
      if (!/\/on-demand\//i.test(path) && !/\/live-tv\//i.test(path)) {
        return false;
      }

      const hasVideo = Array.from(document.querySelectorAll('video')).some((video) => {
        const readyState = Number.isFinite(video.readyState) ? video.readyState : 0;
        return readyState >= 1;
      });

      return hasVideo;
    }
  }

  root.platformRegistry.registerDetector((hostname) => new PlutoTVDetector(hostname));
})();
