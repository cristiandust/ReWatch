(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const dom = root.core.dom;
  const constants = root.constants;
  const titleModule = root.core.title;
  const registry = root.platformRegistry;

  class VideoTracker {
    constructor() {
      this.videoElement = null;
      this.progressInterval = null;
      this.lastSavedTime = 0;
      this.saveThreshold = 10;
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

    getPlatformDetector() {
      if (this.platformDetector) {
        return this.platformDetector;
      }

      const hostname = window.location.hostname;
      const detectorInstances = registry.createDetectors(hostname);

      for (const detector of detectorInstances) {
        if (detector && typeof detector.canDetect === 'function' && detector.canDetect()) {
          console.log('[ReWatch] Using platform detector:', detector.constructor.name);
          this.platformDetector = detector;
          return detector;
        }
      }

      console.log('[ReWatch] No specific platform detector found, using generic detection');
      return null;
    }

    init() {
      console.log('[ReWatch] Initializing video tracker...');
      this.detectVideo();
      this.setupMutationObserver();
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
      titleModule.resetCachedTitle();
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

    detectVideo() {
      const videos = dom.findAllVideoElements();

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
      titleModule.resetCachedTitle();
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

      const delay = (window.self !== window.top) ? 500 : 0;
      this.scheduleResumeCheck(delay);
    }

    extractMetadata() {
      const isInIframe = window.self !== window.top;
      let pageUrl = window.location.href;

      if (isInIframe) {
        try {
          pageUrl = window.top.location.href;
          console.log('[ReWatch] In iframe, using parent URL:', pageUrl);
        } catch (error) {
          console.log('[ReWatch] Cross-origin iframe detected');

          if (window.ReWatchParentUrl) {
            pageUrl = window.ReWatchParentUrl;
            console.log('[ReWatch] Using cached parent URL:', pageUrl);
          } else if (document.referrer && document.referrer !== `${window.location.origin}/`) {
            pageUrl = document.referrer;
            console.log('[ReWatch] Using referrer:', pageUrl);
          } else {
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
        type: platformContentType || 'movie',
        isIframe: isInIframe
      };

      if (metadata.title) {
        metadata.originalTitle = metadata.title;
      }

      const episodeNum = this.extractEpisodeNumber();
      const seasonNum = this.extractSeasonNumber();

      if (episodeNum !== null || seasonNum !== null) {
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

    extractTitle() {
      if (window.self === window.top && titleModule && typeof titleModule.getPageTitle === 'function') {
        const title = titleModule.getPageTitle();
        console.log('[ReWatch] Using getPageTitle():', title);
        return title;
      }

      if (window.self !== window.top && window.ReWatchParentTitle) {
        console.log('[ReWatch] Using cached parent title:', window.ReWatchParentTitle);
        return window.ReWatchParentTitle;
      }

      const platformDetector = this.getPlatformDetector();
      if (platformDetector) {
        const title = platformDetector.extractTitle();
        if (title) {
          return title;
        }
      }

      return this.genericExtractTitle();
    }

    genericExtractTitle() {
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
          if (dom.shouldSkipTitleNode(element)) {
            continue;
          }

          const title = element.content || element.textContent;
          if (title && title.trim().length > 0) {
            const titleLower = title.trim().toLowerCase();

            if (unwantedTitles.some((unwanted) => titleLower.includes(unwanted))) {
              continue;
            }

            return title.trim();
          }
        }
      }

      return document.title || 'Unknown Title';
    }

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

    extractEpisodeNumber() {
      if (window.self !== window.top && window.ReWatchParentEpisode !== undefined) {
        console.log('[ReWatch] Using cached parent episode number:', window.ReWatchParentEpisode);
        return window.ReWatchParentEpisode;
      }

      const platformDetector = this.getPlatformDetector();
      if (platformDetector) {
        const episodeNum = platformDetector.extractEpisodeNumber();
        if (episodeNum !== null) {
          return episodeNum;
        }
        return null;
      }

      return this.genericExtractEpisodeNumber();
    }

    genericExtractEpisodeNumber() {
      let parentUrl = null;
      if (window.self !== window.top && window.ReWatchParentUrl) {
        try {
          parentUrl = new URL(window.ReWatchParentUrl);
        } catch (error) {
          console.log('[ReWatch] Could not parse parent URL');
        }
      }

      const sources = [
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
          return parseInt(episodeNum, 10);
        }
      }

      console.log('[ReWatch] Could not detect episode number');
      return null;
    }

    extractSeasonNumber() {
      if (window.self !== window.top && window.ReWatchParentSeason !== undefined) {
        console.log('[ReWatch] Using cached parent season number:', window.ReWatchParentSeason);
        return window.ReWatchParentSeason;
      }

      const platformDetector = this.getPlatformDetector();
      if (platformDetector) {
        const seasonNum = platformDetector.extractSeasonNumber();
        if (seasonNum !== null) {
          return seasonNum;
        }
        return null;
      }

      return this.genericExtractSeasonNumber();
    }

    genericExtractSeasonNumber() {
      const sources = [
        () => {
          const urlPath = window.location.pathname;
          const patterns = [
            /season[_-]?(\d+)/i,
            /s(\d+)e\d+/i
          ];

          for (const pattern of patterns) {
            const match = urlPath.match(pattern);
            if (match && parseInt(match[1], 10) > 0) {
              console.log('[ReWatch] Found season from URL:', match[1]);
              return match[1];
            }
          }
          return null;
        },
        () => {
          const title = this.extractTitle() || '';
          const patterns = [
            /Season\s+(\d+)/i,
            /Series\s+(\d+)/i
          ];

          for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match && parseInt(match[1], 10) > 0) {
              console.log('[ReWatch] Found season from title:', match[1]);
              return match[1];
            }
          }
          return null;
        }
      ];

      for (const source of sources) {
        const seasonNum = source();
        if (seasonNum) {
          return parseInt(seasonNum, 10);
        }
      }

      console.log('[ReWatch] Could not detect season number');
      return null;
    }

    onVideoPlay() {
      console.log('[ReWatch] Video playing');

      this.progressInterval = setInterval(() => {
        this.saveProgress();
      }, 5000);
    }

    onVideoPause() {
      console.log('[ReWatch] Video paused');

      if (this.progressInterval) {
        clearInterval(this.progressInterval);
        this.progressInterval = null;
      }

      this.saveProgress();
    }

    onTimeUpdate() {
      if (!this.videoElement) {
        return;
      }

      const currentTime = this.videoElement.currentTime;

      if (Math.abs(currentTime - this.lastSavedTime) >= this.saveThreshold) {
        this.saveProgress();
      }
    }

    onVideoEnded() {
      console.log('[ReWatch] Video ended');
      this.saveProgress(true);
    }

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

      if (enforcePlatformRestrictions && Number.isFinite(duration) && duration < constants.MINIMUM_CLIP_DURATION_SECONDS) {
        console.log('[ReWatch] Skipping save - duration below minimum threshold');
        return;
      }

      if (enforcePlatformRestrictions && platformDetector && !platformDetector.isValidPlaybackPage()) {
        console.log('[ReWatch] Not a valid playback page - skipping save');
        return;
      }

      if (!metadata.platform || !constants.SUPPORTED_PLATFORM_NAMES.includes(metadata.platform)) {
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

      if (!chrome.runtime || !chrome.runtime.id) {
        console.log('[ReWatch] Extension context invalidated - skipping save');
        return;
      }

      try {
        chrome.runtime.sendMessage({
          action: 'saveProgress',
          data: progressData
        }, (response) => {
          if (chrome.runtime.lastError) {
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
      } catch (error) {
        console.log('[ReWatch] Error saving progress (extension may be reloading):', error.message);
      }
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

    async checkSavedProgress() {
      if (!this.videoElement) {
        return;
      }

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
            console.log('[ReWatch] Could not check saved progress:', chrome.runtime.lastError.message);
            return;
          }
          if (response && response.success && response.data) {
            const { currentTime, percentComplete } = response.data;

            if (currentTime > 30 && percentComplete < 95) {
              this.promptResume(currentTime);
            }
          }
        });
      } catch (error) {
        console.log('[ReWatch] Error checking saved progress:', error.message);
      }
    }

    promptResume(savedTime) {
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

      document.getElementById('wg-resume').addEventListener('click', () => {
        this.videoElement.currentTime = savedTime;
        overlay.remove();
      });

      document.getElementById('wg-start-over').addEventListener('click', () => {
        overlay.remove();
      });

      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.remove();
        }
      }, 10000);
    }
  }

  root.core.VideoTracker = VideoTracker;

  let globalTracker = null;

  const initializeTracker = () => {
    console.log('[ReWatch] Initializing video tracker... Document ready state:', document.readyState);

    if (!globalTracker) {
      globalTracker = new VideoTracker();
      globalTracker.init();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTracker);
  } else {
    initializeTracker();
  }

  window.addEventListener('load', () => {
    console.log('[ReWatch] Window loaded, checking for tracker...');
    if (!globalTracker) {
      initializeTracker();
    } else if (!globalTracker.videoElement) {
      console.log('[ReWatch] Tracker exists but no video, retrying detection...');
      globalTracker.detectVideo();
    }
  });
})();
