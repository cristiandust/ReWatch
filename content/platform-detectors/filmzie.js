(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const { PlatformDetector } = root.core;

  class FilmzieDetector extends PlatformDetector {
    canDetect() {
      return /(^|\.)filmzie\.(com|tv)$/i.test(this.hostname);
    }

    getPlatformName() {
      return 'Filmzie';
    }

    filterVideoElements(videoElements) {
      if (!Array.isArray(videoElements)) {
        return [];
      }

      return videoElements.filter((video) => {
        if (!video) {
          return false;
        }

        const duration = Number.isFinite(video.duration) ? video.duration : NaN;
        if (Number.isFinite(duration) && duration > 0 && duration < 300) {
          return false;
        }

        const parent = video.closest('.ad-player, .ads, [data-testid="ad-player"], .jw-ads');
        if (parent) {
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
        'h1[data-testid="title"]',
        'h1',
        '.movie-title',
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
        const cleaned = text.replace(/\s*\|\s*Filmzie$/i, '').trim();
        if (cleaned) {
          return cleaned;
        }
      }

      return null;
    }

    getContentType() {
      const path = window.location.pathname || '';
      if (/\/series\//i.test(path) || /season/i.test(path)) {
        return 'episode';
      }
      return 'movie';
    }

    isValidPlaybackPage() {
      const path = window.location.pathname || '';
      if (!/watch/i.test(path) && !/movie/i.test(path) && !/series/i.test(path)) {
        return false;
      }

      const hasVideo = Array.from(document.querySelectorAll('video')).some((video) => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        return duration === 0 || duration >= 300;
      });

      return hasVideo;
    }
  }

  root.platformRegistry.registerDetector((hostname) => new FilmzieDetector(hostname));
})();
