(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const { PlatformDetector } = root.core;

  class RokuChannelDetector extends PlatformDetector {
    constructor(hostname) {
      super(hostname);
      this._cachedLd = null;
      this._ldParsed = false;
    }

    canDetect() {
      return /therokuchannel\.roku\.com$/i.test(this.hostname) || /\.roku\.com$/i.test(this.hostname);
    }

    getPlatformName() {
      return 'The Roku Channel';
    }

    _getStructuredData() {
      if (this._ldParsed) {
        return this._cachedLd;
      }

      this._ldParsed = true;
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const content = script.textContent || script.innerText;
          if (!content) {
            continue;
          }

          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed)) {
              this._cachedLd = parsed.find((item) => item && typeof item === 'object' && (item['@type'] === 'TVEpisode' || item['@type'] === 'Movie'));
              if (this._cachedLd) {
                break;
              }
            } else if (parsed['@type'] === 'TVEpisode' || parsed['@type'] === 'Movie') {
              this._cachedLd = parsed;
              break;
            }
          }
        } catch (_error) {
          // Ignore JSON parse issues from unrelated ld-json blocks
        }
      }
      return this._cachedLd;
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

        const candidateDuration = Number.isFinite(candidate.duration) ? candidate.duration : 0;
        const selectedDuration = Number.isFinite(selected.duration) ? selected.duration : 0;
        return candidateDuration >= selectedDuration ? candidate : selected;
      }, null);
    }

    extractTitle() {
      const ld = this._getStructuredData();
      if (ld && ld.series && ld.series.name) {
        return ld.series.name;
      }
      if (ld && ld.name) {
        return ld.name;
      }

      const selectors = [
        'h1[data-testid="title"]',
        'meta[property="og:title"]',
        'title'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (!element) {
          continue;
        }
        const text = element.content || element.textContent || '';
        const cleaned = text.replace(/\s*\|\s*The Roku Channel$/i, '').trim();
        if (cleaned) {
          return cleaned;
        }
      }

      return null;
    }

    extractEpisodeName() {
      const ld = this._getStructuredData();
      if (ld && ld['@type'] === 'TVEpisode' && ld.name) {
        return ld.name;
      }

      const subtitle = document.querySelector('[data-testid="episode-title"], .episode-title');
      if (subtitle && subtitle.textContent) {
        const text = subtitle.textContent.trim();
        if (text) {
          return text;
        }
      }

      return null;
    }

    extractEpisodeNumber() {
      const ld = this._getStructuredData();
      const candidate = ld?.episodeNumber || ld?.episode || ld?.partOfEpisode?.episodeNumber;
      if (Number.isFinite(candidate)) {
        return parseInt(candidate, 10);
      }
      if (typeof candidate === 'string') {
        const match = candidate.match(/\d+/);
        if (match) {
          return parseInt(match[0], 10);
        }
      }

      const label = document.querySelector('[data-testid="episode-number"], .episode-number');
      if (label && label.textContent) {
        const match = label.textContent.match(/Episode\s*(\d+)/i) || label.textContent.match(/\bE(\d+)\b/i);
        if (match) {
          return parseInt(match[1], 10);
        }
      }

      return null;
    }

    extractSeasonNumber() {
      const ld = this._getStructuredData();
      const partOfSeason = ld?.partOfSeason;
      if (partOfSeason) {
        const candidate = partOfSeason.seasonNumber || partOfSeason.name;
        if (Number.isFinite(candidate)) {
          return parseInt(candidate, 10);
        }
        if (typeof candidate === 'string') {
          const match = candidate.match(/\d+/);
          if (match) {
            return parseInt(match[0], 10);
          }
        }
      }

      const label = document.querySelector('[data-testid="season-number"], .season-number');
      if (label && label.textContent) {
        const match = label.textContent.match(/Season\s*(\d+)/i) || label.textContent.match(/\bS(\d+)\b/i);
        if (match) {
          return parseInt(match[1], 10);
        }
      }

      return null;
    }

    getContentType() {
      const ld = this._getStructuredData();
      if (ld && ld['@type'] === 'TVEpisode') {
        return 'episode';
      }
      return 'movie';
    }

    isValidPlaybackPage() {
      const hasVideo = Array.from(document.querySelectorAll('video')).some((video) => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        return duration === 0 || duration > 90;
      });

      return hasVideo;
    }
  }

  root.platformRegistry.registerDetector((hostname) => new RokuChannelDetector(hostname));
})();
