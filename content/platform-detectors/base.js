(() => {
  if (typeof window === 'undefined') {
    return;
  }

  class PlatformDetector {
    constructor(hostname) {
      this.hostname = hostname;
    }

    canDetect() { return false; }
    getPlatformName() { return null; }
    extractEpisodeNumber() { return null; }
    extractSeasonNumber() { return null; }
    extractTitle() { return null; }
    extractEpisodeName() { return null; }
    inferEpisodeInfoFromTitle() { return null; }
    getContentType() { return null; }
    isValidPlaybackPage() { return true; }
    filterVideoElements(videoElements) {
      return Array.isArray(videoElements) ? videoElements : [];
    }
    selectVideoElement() {
      return null;
    }
  }

  window.ReWatch.core.PlatformDetector = PlatformDetector;
})();
