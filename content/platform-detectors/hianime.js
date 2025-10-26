(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const { PlatformDetector } = root.core;

  class HiAnimeDetector extends PlatformDetector {
    canDetect() {
      return this.hostname.includes('hianime') || this.hostname.includes('aniwatch');
    }

    getPlatformName() {
      return 'HiAnime';
    }

    extractEpisodeNumber() {
      const watchingText = document.querySelector('.film-watching, [class*="watching"], .server-notice');
      if (watchingText) {
        const match = watchingText.textContent.match(/Episode\s+(\d+)/i);
        if (match) {
          console.log('[ReWatch][HiAnime] Found episode from watching text:', match[1]);
          return parseInt(match[1], 10);
        }
      }

      const bodyText = document.body.textContent;
      const bodyMatch = bodyText.match(/You are watching.*?Episode\s+(\d+)/i);
      if (bodyMatch) {
        console.log('[ReWatch][HiAnime] Found episode from body text:', bodyMatch[1]);
        return parseInt(bodyMatch[1], 10);
      }

      const urlParams = new URLSearchParams(window.location.search);
      const epParam = urlParams.get('ep');
      if (epParam) {
        console.log('[ReWatch][HiAnime] Found episode from URL param:', epParam);
        return parseInt(epParam, 10);
      }

      return null;
    }

    extractSeasonNumber() {
      const urlPath = window.location.pathname;
      const match = urlPath.match(/season[_-]?(\d+)/i);
      if (match) {
        console.log('[ReWatch][HiAnime] Found season from URL:', match[1]);
        return parseInt(match[1], 10);
      }
      return null;
    }

    extractTitle() {
      const titleElement = document.querySelector('.film-name, [class*="film-name"]');
      if (titleElement && titleElement.textContent) {
        console.log('[ReWatch][HiAnime] Found title:', titleElement.textContent.trim());
        return titleElement.textContent.trim();
      }
      return null;
    }

    extractEpisodeName() {
      return null;
    }
  }

  root.platformRegistry.registerDetector((hostname) => new HiAnimeDetector(hostname));
})();
