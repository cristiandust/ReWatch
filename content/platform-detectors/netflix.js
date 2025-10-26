(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const { PlatformDetector } = root.core;

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

    getNetflixMetadata() {
      try {
        if (window.netflix && window.netflix.reactContext) {
          const models = window.netflix.reactContext.models;
          if (models && models.videoPlayer && models.videoPlayer.data) {
            return models.videoPlayer.data;
          }
        }

        if (window.netflix && window.netflix.playerModel) {
          return window.netflix.playerModel;
        }
      } catch (error) {
        console.log('[ReWatch][Netflix] Error accessing metadata:', error.message);
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
      } catch (error) {
        console.log('[ReWatch][Netflix] Error accessing falcorCache:', error.message);
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
        ].filter((value) => typeof value === 'string').map((value) => value.toLowerCase());

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

      const addCandidate = (value) => {
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
      sanitized = sanitized.replace(/[\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()}`);

      sanitized = sanitized.replace(/\\([^"\\/bfnrtu])/g, (_match, char) => `\\\\${char}`);

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
        if (metadata.title) {
          console.log('[ReWatch][Netflix] Found title from metadata:', metadata.title);
          return metadata.title;
        }

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

      const docTitle = document.title;
      if (docTitle && docTitle !== 'Netflix') {
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
        if (metadata.episodeTitle) {
          console.log('[ReWatch][Netflix] Found episode name from metadata:', metadata.episodeTitle);
          return metadata.episodeTitle;
        }

        if (metadata.currentEpisodeTitle) {
          console.log('[ReWatch][Netflix] Found episode name from currentEpisodeTitle:', metadata.currentEpisodeTitle);
          return metadata.currentEpisodeTitle;
        }
      }

      return null;
    }

    isValidPlaybackPage() {
      const htmlElement = document.documentElement;
      if (!htmlElement.classList.contains('watch-video-root')) {
        console.log('[ReWatch][Netflix] Not on watch page - likely a preview/browse page');
        return false;
      }

      if (!/\/watch\/\d+/i.test(window.location.pathname)) {
        console.log('[ReWatch][Netflix] URL does not contain /watch/ - not a playback page');
        return false;
      }

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

  root.platformRegistry.registerDetector((hostname) => new NetflixDetector(hostname));
  root.core.NetflixDetector = NetflixDetector;
})();
