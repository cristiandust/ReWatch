(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const { PlatformDetector } = root.core;
  const dom = root.core.dom;
  const constants = root.constants;

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
          if (this._isIgnoredNode(video) || dom.isNodeInUpNextSection(video)) {
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
          if (duration >= constants.MINIMUM_CLIP_DURATION_SECONDS) {
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
          const rootNode = current.getRootNode();
          if (rootNode && rootNode.host && rootNode !== current) {
            current = rootNode.host;
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
        if (constants.UP_NEXT_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
          return null;
        }
        seen.add(trimmed);
        return this._parseSeasonEpisode(trimmed);
      };

      const parsedFromSelectors = dom.findAcrossAllRoots(selectors, (node) => {
        const element = dom.getElementNode(node);
        if (!element) {
          return null;
        }

        if (!dom.isNodeVisible(element) || dom.isNodeInUpNextSection(element)) {
          return null;
        }

        if (this._isIgnoredNode(element) || dom.shouldSkipTitleNode(element)) {
          return null;
        }

        return evaluateText(element.textContent || '');
      });

      if (parsedFromSelectors) {
        return parsedFromSelectors;
      }

      const parsedFromAria = dom.findAcrossAllRoots('[aria-label]', (node) => {
        const element = dom.getElementNode(node);
        if (!element || typeof element.getAttribute !== 'function') {
          return null;
        }

        if (!dom.isNodeVisible(element) || dom.isNodeInUpNextSection(element)) {
          return null;
        }

        if (this._isIgnoredNode(element) || dom.shouldSkipTitleNode(element)) {
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

      return dom.findAcrossAllRoots(overlaySelectors, (node) => {
        const element = dom.getElementNode(node);
        if (!element) {
          return null;
        }

        if (this._isIgnoredNode(element) || dom.isNodeInUpNextSection(element)) {
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

      const fromSelectors = dom.findAcrossAllRoots(selectors, (node) => {
        const element = dom.getElementNode(node);
        if (!element || !element.textContent) {
          return null;
        }

        if (!dom.isNodeVisible(element) || dom.isNodeInUpNextSection(element)) {
          return null;
        }

        if (this._isIgnoredNode(element) || dom.shouldSkipTitleNode(element)) {
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

      const extracted = dom.findAcrossAllRoots(selectors, (node) => {
        const element = dom.getElementNode(node);
        if (!element || !element.textContent) {
          return null;
        }

        if (!dom.isNodeVisible(element) || dom.isNodeInUpNextSection(element)) {
          return null;
        }

        if (this._isIgnoredNode(element) || dom.shouldSkipTitleNode(element)) {
          return null;
        }

        let text = element.textContent.trim();
        if (!text) {
          return null;
        }

        if (constants.UP_NEXT_KEYWORDS.some((keyword) => text.toLowerCase().includes(keyword))) {
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
      const found = dom.findAcrossAllRoots(selectors, (node) => node);
      return found || null;
    }

    _isWithinPlaybackView(node) {
      if (!node || typeof node.closest !== 'function') {
        const rootNode = this._getPlaybackRoot();
        return !rootNode;
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

      if (!this._isWithinPlaybackView(video) || dom.isNodeInUpNextSection(video)) {
        return false;
      }

      if (!dom.isNodeVisible(video)) {
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

      if (!this._isWithinPlaybackView(video) || dom.isNodeInUpNextSection(video)) {
        return false;
      }

      if (!dom.isNodeVisible(video)) {
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
      const videoElements = dom.findAllVideoElements();
      const seasonEpisodeInfo = this._collectSeasonEpisodeInfo();
      const contentType = this._determineContentType(seasonEpisodeInfo, path);
      const playbackRoot = this._getPlaybackRoot();
      const hasVisiblePlaybackRoot = playbackRoot && dom.isNodeVisible(playbackRoot);
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

  root.platformRegistry.registerDetector((hostname) => new DisneyPlusDetector(hostname));
})();
