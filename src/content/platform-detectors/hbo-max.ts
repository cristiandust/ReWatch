import { PlatformDetector } from './base';
import type { ReWatchNamespace } from '../core/namespace';
import type { PlatformRegistry } from '../core/platform-registry';

type HboWindow = typeof window & {
	ReWatch?: ReWatchNamespace & {
		platformRegistry?: PlatformRegistry<PlatformDetector>;
	};
};

class HBOMaxDetector extends PlatformDetector {
	static identifier = 'HBOMaxDetector';

	canDetect(): boolean {
		const normalized = this.hostname.toLowerCase();
		if (normalized.includes('hbomax')) {
			return true;
		}
		if (normalized.endsWith('.max.com') || normalized.includes('.max.com') || normalized === 'max.com') {
			return true;
		}
		return normalized.includes('hbo.') || normalized.startsWith('hbo');
	}

	getPlatformName(): string {
		return 'HBO Max';
	}

	extractEpisodeNumber(): number | null {
		const element = document.querySelector('[data-testid="player-ux-season-episode"]');
		if (element && element.textContent) {
			const match = element.textContent.match(/E\s*(\d+)/i);
			if (match) {
				console.log('[ReWatch][HBO] Found episode number:', match[1]);
				return parseInt(match[1], 10);
			}
		}
		console.log('[ReWatch][HBO] No episode number found - this is a movie');
		return null;
	}

	extractSeasonNumber(): number | null {
		const element = document.querySelector('[data-testid="player-ux-season-episode"]');
		if (element && element.textContent) {
			const match = element.textContent.match(/S\s*(\d+)/i);
			if (match) {
				console.log('[ReWatch][HBO] Found season number:', match[1]);
				return parseInt(match[1], 10);
			}
		}
		console.log('[ReWatch][HBO] No season number found - this is a movie');
		return null;
	}

	extractTitle(): string | null {
		const element = document.querySelector('[data-testid="player-ux-asset-title"]');
		if (element && element.textContent) {
			const title = element.textContent.trim();
			console.log('[ReWatch][HBO] Found title:', title);
			return title;
		}
		return null;
	}

	extractEpisodeName(): string | null {
		const element = document.querySelector('[data-testid="player-ux-asset-subtitle"]');
		if (element && element.textContent) {
			const subtitle = element.textContent.trim();
			console.log('[ReWatch][HBO] Found episode name:', subtitle);
			return subtitle;
		}
		return null;
	}

	isValidPlaybackPage(): boolean {
		const playerUI = document.querySelector('[data-testid="player-ux-asset-title"]');
		if (!playerUI) {
			console.log('[ReWatch][HBO] Not in player UI - likely info page');
			return false;
		}
		return true;
	}
}

const initializeHBOMaxDetector = () => {
	if (typeof window === 'undefined') {
		return;
	}

	const globalWindow = window as HboWindow;
	const registry = globalWindow.ReWatch?.platformRegistry;
	registry?.registerDetector((hostname) => new HBOMaxDetector(hostname));
};

initializeHBOMaxDetector();

export { HBOMaxDetector };
