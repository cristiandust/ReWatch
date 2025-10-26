(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const { PlatformDetector } = root.core;

  class HBOMaxDetector extends PlatformDetector {
    canDetect() {
      return this.hostname.includes('hbo') || this.hostname.includes('max');
    }

    getPlatformName() {
      return 'HBO Max';
    }

    extractEpisodeNumber() {
      const seasonEpisodeElement = document.querySelector('[data-testid="player-ux-season-episode"]');
      if (seasonEpisodeElement && seasonEpisodeElement.textContent) {
        const match = seasonEpisodeElement.textContent.match(/E\s*(\d+)/i);
        if (match) {
          console.log('[ReWatch][HBO] Found episode number:', match[1]);
          return parseInt(match[1], 10);
        }
      }
      console.log('[ReWatch][HBO] No episode number found - this is a movie');
      return null;
    }

    extractSeasonNumber() {
      const seasonEpisodeElement = document.querySelector('[data-testid="player-ux-season-episode"]');
      if (seasonEpisodeElement && seasonEpisodeElement.textContent) {
        const match = seasonEpisodeElement.textContent.match(/S\s*(\d+)/i);
        if (match) {
          console.log('[ReWatch][HBO] Found season number:', match[1]);
          return parseInt(match[1], 10);
        }
      }
      console.log('[ReWatch][HBO] No season number found - this is a movie');
      return null;
    }

    extractTitle() {
      const titleElement = document.querySelector('[data-testid="player-ux-asset-title"]');
      if (titleElement && titleElement.textContent) {
        console.log('[ReWatch][HBO] Found title:', titleElement.textContent.trim());
        return titleElement.textContent.trim();
      }
      return null;
    }

    extractEpisodeName() {
      const episodeNameElement = document.querySelector('[data-testid="player-ux-asset-subtitle"]');
      if (episodeNameElement && episodeNameElement.textContent) {
        console.log('[ReWatch][HBO] Found episode name:', episodeNameElement.textContent.trim());
        return episodeNameElement.textContent.trim();
      }
      return null;
    }

    isValidPlaybackPage() {
      const playerUI = document.querySelector('[data-testid="player-ux-asset-title"]');
      if (!playerUI) {
        console.log('[ReWatch][HBO] Not in player UI - likely info page');
        return false;
      }
      return true;
    }
  }

  root.platformRegistry.registerDetector((hostname) => new HBOMaxDetector(hostname));
})();
