(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const { PlatformDetector } = root.core;

  class YouTubeDetector extends PlatformDetector {
    canDetect() {
      return /(^|\.)youtube\.com$/i.test(this.hostname) || /(^|\.)youtube-nocookie\.com$/i.test(this.hostname);
    }

    getPlatformName() {
      return 'YouTube';
    }

    filterVideoElements(videoElements) {
      if (!Array.isArray(videoElements)) {
        return [];
      }

      const MIN_DURATION = 5 * 60; // Skip shorts and trailers

      return videoElements.filter((video) => {
        if (!video) {
          return false;
        }

        const duration = Number.isFinite(video.duration) ? video.duration : NaN;
        if (Number.isFinite(duration) && duration > 0 && duration < MIN_DURATION) {
          return false;
        }

        const src = typeof video.currentSrc === 'string' ? video.currentSrc : '';
        if (src.includes('googlevideo.com/ss') || src.includes('mime=video%2Fmp2t')) {
          return false; // Likely companion ad
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

      return videoElements.reduce((current, candidate) => {
        if (!candidate) {
          return current;
        }
        if (!current) {
          return candidate;
        }

        const candidateDuration = Number.isFinite(candidate.duration) ? candidate.duration : 0;
        const currentDuration = Number.isFinite(current.duration) ? current.duration : 0;

        if (candidateDuration !== currentDuration) {
          return candidateDuration > currentDuration ? candidate : current;
        }

        try {
          const candidateRect = candidate.getBoundingClientRect();
          const currentRect = current.getBoundingClientRect();
          const candidateArea = Math.max(0, candidateRect.width) * Math.max(0, candidateRect.height);
          const currentArea = Math.max(0, currentRect.width) * Math.max(0, currentRect.height);
          return candidateArea >= currentArea ? candidate : current;
        } catch (_error) {
          return candidateDuration >= currentDuration ? candidate : current;
        }
      }, null);
    }

    extractTitle() {
      const selectors = [
        'h1.title',
        '#container h1',
        'ytd-watch-metadata h1',
        'meta[property="og:title"]',
        'meta[name="title"]',
        'title'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (!element) {
          continue;
        }

        const text = element.content || element.innerText || element.textContent;
        if (text && text.trim()) {
          const cleaned = text
            .replace(/\s*-\s*YouTube$/i, '')
            .replace(/^Watch\s+/i, '')
            .trim();
          if (cleaned) {
            return cleaned;
          }
        }
      }
      return null;
    }

    getContentType() {
      return 'movie';
    }

    isValidPlaybackPage() {
      const url = new URL(window.location.href);
      if (url.hostname.includes('youtube.com')) {
        if (url.pathname === '/watch' && url.searchParams.has('v')) {
          return true;
        }
      }

      return Array.from(document.querySelectorAll('video')).some((video) => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        return duration === 0 || duration >= 300;
      });
    }
  }

  root.platformRegistry.registerDetector((hostname) => new YouTubeDetector(hostname));
})();
