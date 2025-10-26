(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const { PlatformDetector } = root.core;

  class PlexDetector extends PlatformDetector {
    constructor(hostname) {
      super(hostname);
      this._structuredData = null;
      this._structuredDataParsed = false;
    }

    canDetect() {
      return /(^|\.)plex\.tv$/i.test(this.hostname);
    }

    getPlatformName() {
      return 'Plex';
    }

    _parseStructuredData() {
      if (this._structuredDataParsed) {
        return this._structuredData;
      }
      this._structuredDataParsed = true;

      const scripts = document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"][data-state], script[type="application/json"][data-qa-id="metadata-json"]');
      for (const script of scripts) {
        const text = script.textContent || script.innerText || '';
        if (!text) {
          continue;
        }
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed)) {
              const media = parsed.find((entry) => entry && typeof entry === 'object' && (entry['@type'] === 'TVEpisode' || entry['@type'] === 'Movie'));
              if (media) {
                this._structuredData = media;
                break;
              }
            } else if (parsed['@type'] === 'TVEpisode' || parsed['@type'] === 'Movie') {
              this._structuredData = parsed;
              break;
            }
          }
        } catch (_error) {
          // Ignore invalid JSON blocks
        }
      }

      if (!this._structuredData) {
        const globalCandidates = [
          window.__INITIAL_STATE__,
          window.__PRELOADED_STATE__,
          window.__PlexAppInitialState,
          window.__PLEX_INITIAL_STATE__
        ];
        for (const candidate of globalCandidates) {
          if (candidate && typeof candidate === 'object') {
            const maybeMetadata = candidate.metadata || candidate.playback || candidate.item || candidate.currentMetadata;
            if (maybeMetadata) {
              this._structuredData = maybeMetadata;
              break;
            }
          }
        }
      }

      return this._structuredData;
    }

    filterVideoElements(videoElements) {
      if (!Array.isArray(videoElements)) {
        return [];
      }

      return videoElements.filter((video) => {
        if (!video) {
          return false;
        }

        const container = video.closest('[data-qa-id="ad-player"], .ad-container, .commercial, .adzone');
        if (container) {
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

      return videoElements.reduce((selected, candidate) => {
        if (!candidate) {
          return selected;
        }
        if (!selected) {
          return candidate;
        }

        const candidateReady = Number.isFinite(candidate.readyState) ? candidate.readyState : 0;
        const selectedReady = Number.isFinite(selected.readyState) ? selected.readyState : 0;
        if (candidateReady !== selectedReady) {
          return candidateReady > selectedReady ? candidate : selected;
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
      const ld = this._parseStructuredData();
      if (ld) {
        if (ld.series && ld.series.name) {
          return String(ld.series.name).trim();
        }
        if (ld.name) {
          return String(ld.name).trim();
        }
      }

      const selectors = [
        '[data-qa-id="metadata-grandparent-title"]',
        '[data-qa-id="metadata-title"]',
        '.MetadataPosterCard-title',
        '.PrePlayPage-title',
        'meta[property="og:title"]',
        'title'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (!element) {
          continue;
        }
        const text = element.content || element.textContent || '';
        const cleaned = text.replace(/\s*\|\s*Plex$/i, '').trim();
        if (cleaned) {
          return cleaned;
        }
      }

      return null;
    }

    extractEpisodeName() {
      const ld = this._parseStructuredData();
      if (ld && ld['@type'] === 'TVEpisode' && ld.name) {
        return String(ld.name).trim();
      }

      const selectors = [
        '[data-qa-id="metadata-title"]',
        '[data-qa-id="metadata-children-title"]',
        '.MetadataPosterCard-title',
        '.PrePlayPage-title'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent) {
          const text = element.textContent.trim();
          if (text && text.length < 300) {
            return text;
          }
        }
      }

      return null;
    }

    _extractIndexFromElement(selector, fallbackPattern = /\d+/) {
      const element = document.querySelector(selector);
      if (!element || !element.textContent) {
        return null;
      }
      const match = element.textContent.match(fallbackPattern);
      if (match) {
        const value = parseInt(match[1] || match[0], 10);
        if (Number.isFinite(value)) {
          return value;
        }
      }
      return null;
    }

    extractEpisodeNumber() {
      const ld = this._parseStructuredData();
      const candidate = ld?.episodeNumber || ld?.episode || ld?.episodeNumberEnd;
      if (Number.isFinite(candidate)) {
        return parseInt(candidate, 10);
      }
      if (typeof candidate === 'string') {
        const match = candidate.match(/\d+/);
        if (match) {
          return parseInt(match[0], 10);
        }
      }

      const selectors = [
        '[data-qa-id="metadata-episode-index"]',
        '[data-qa-id="metadata-children-index"]',
        '[data-qa-id="metadata-index"]',
        '.PrePlayPage-episodeBadge',
        '.MetadataPosterCard-episodeBadge'
      ];

      for (const selector of selectors) {
        const value = this._extractIndexFromElement(selector, /Episode\s*(\d+)/i);
        if (Number.isFinite(value)) {
          return value;
        }
      }

      const title = document.title || '';
      const titleMatch = title.match(/E(\d+)/i);
      if (titleMatch) {
        return parseInt(titleMatch[1], 10);
      }

      return null;
    }

    extractSeasonNumber() {
      const ld = this._parseStructuredData();
      const seasonCandidate = ld?.partOfSeason?.seasonNumber || ld?.seasonNumber || ld?.season;
      if (Number.isFinite(seasonCandidate)) {
        return parseInt(seasonCandidate, 10);
      }
      if (typeof seasonCandidate === 'string') {
        const match = seasonCandidate.match(/\d+/);
        if (match) {
          return parseInt(match[0], 10);
        }
      }

      const selectors = [
        '[data-qa-id="metadata-parent-index"]',
        '[data-qa-id="metadata-grandparent-index"]',
        '.PrePlayPage-seasonBadge',
        '.MetadataPosterCard-seasonBadge'
      ];

      for (const selector of selectors) {
        const value = this._extractIndexFromElement(selector, /Season\s*(\d+)/i);
        if (Number.isFinite(value)) {
          return value;
        }
      }

      const title = document.title || '';
      const titleMatch = title.match(/S(\d+)/i);
      if (titleMatch) {
        return parseInt(titleMatch[1], 10);
      }

      return null;
    }

    getContentType() {
      const ld = this._parseStructuredData();
      if (ld && ld['@type'] === 'TVEpisode') {
        return 'episode';
      }
      const season = this.extractSeasonNumber();
      const episode = this.extractEpisodeNumber();
      if (Number.isFinite(season) || Number.isFinite(episode)) {
        return 'episode';
      }
      return 'movie';
    }

    isValidPlaybackPage() {
      const hasVideo = Array.from(document.querySelectorAll('video')).some((video) => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        return duration === 0 || duration > 90;
      });

      if (!hasVideo) {
        return false;
      }

      const path = window.location.pathname || '';
      if (/\/watch\//i.test(path) || /\/preplay\//i.test(path) || /\/server\//i.test(path)) {
        return true;
      }

      return Boolean(document.querySelector('[data-qa-id="metadata-title"], [data-qa-id="metadata-grandparent-title"], meta[property="og:title"]'));
    }
  }

  root.platformRegistry.registerDetector((hostname) => new PlexDetector(hostname));
})();
