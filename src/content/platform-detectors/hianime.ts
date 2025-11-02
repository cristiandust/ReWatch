import { PlatformDetector } from './base';
import type { ReWatchNamespace } from '../core/namespace';
import type { PlatformRegistry } from '../core/platform-registry';

type HiAnimeWindow = typeof window & {
	ReWatch?: ReWatchNamespace & {
		platformRegistry?: PlatformRegistry<PlatformDetector>;
	};
};

class HiAnimeDetector extends PlatformDetector {
	static identifier = 'HiAnimeDetector';

	canDetect(): boolean {
		return this.hostname.includes('hianime') || this.hostname.includes('aniwatch');
	}

	getPlatformName(): string {
		return 'HiAnime';
	}

	extractEpisodeNumber(): number | null {
		const watchingText = document.querySelector('.film-watching, [class*="watching"], .server-notice');
		if (watchingText && watchingText.textContent) {
			const match = watchingText.textContent.match(/Episode\s+(\d+)/i);
			if (match) {
				console.log('[ReWatch][HiAnime] Found episode from watching text:', match[1]);
				return parseInt(match[1], 10);
			}
		}

		const bodyText = document.body?.textContent || '';
		const bodyMatch = bodyText.match(/You are watching.*?Episode\s+(\d+)/i);
		if (bodyMatch) {
			console.log('[ReWatch][HiAnime] Found episode from body text:', bodyMatch[1]);
			return parseInt(bodyMatch[1], 10);
		}

		const urlParams = new URLSearchParams(window.location.search);
		const epParam = urlParams.get('ep');
		if (epParam) {
			console.log('[ReWatch][HiAnime] Found episode from URL param:', epParam);
			const parsed = parseInt(epParam, 10);
			return Number.isFinite(parsed) ? parsed : null;
		}

		return null;
	}

	extractSeasonNumber(): number | null {
		const urlPath = window.location.pathname;
		const match = urlPath.match(/season[_-]?(\d+)/i);
		if (match) {
			console.log('[ReWatch][HiAnime] Found season from URL:', match[1]);
			return parseInt(match[1], 10);
		}
		return null;
	}

	extractTitle(): string | null {
		const titleElement = document.querySelector('.film-name, [class*="film-name"]');
		if (titleElement && titleElement.textContent) {
			const title = titleElement.textContent.trim();
			console.log('[ReWatch][HiAnime] Found title:', title);
			return title;
		}
		return null;
	}

	extractEpisodeName(): string | null {
		return null;
	}
}

const initializeHiAnimeDetector = () => {
	if (typeof window === 'undefined') {
		return;
	}

	const globalWindow = window as HiAnimeWindow;
	const registry = globalWindow.ReWatch?.platformRegistry;
	registry?.registerDetector((hostname) => new HiAnimeDetector(hostname));
};

initializeHiAnimeDetector();

export { HiAnimeDetector };
