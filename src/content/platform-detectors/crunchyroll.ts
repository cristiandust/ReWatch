import { PlatformDetector } from './base';
import type { ReWatchNamespace } from '../core/namespace';
import type { PlatformRegistry } from '../core/platform-registry';

type ReWatchWindow = typeof window & {
	ReWatch?: ReWatchNamespace & {
		platformRegistry?: PlatformRegistry<PlatformDetector>;
	};
};

class CrunchyrollDetector extends PlatformDetector {
	canDetect(): boolean {
		return /crunchyroll\.com$/i.test(this.hostname) || /\.crunchyroll\.com$/i.test(this.hostname);
	}

	getPlatformName(): string {
		return 'Crunchyroll';
	}

	filterVideoElements(videoElements: HTMLVideoElement[] | null | undefined): HTMLVideoElement[] {
		if (!Array.isArray(videoElements)) {
			return [];
		}

		return videoElements.filter((video) => {
			if (!video) {
				return false;
			}

			const classTokens = Array.from(video.classList || []).map((cls) => cls.toLowerCase());
			if (classTokens.some((cls) => cls.includes('ad') || cls.includes('ima'))) {
				return false;
			}

			const duration = Number.isFinite(video.duration) ? video.duration : NaN;
			if (Number.isFinite(duration) && duration > 0 && duration < 60) {
				return false;
			}

			return true;
		});
	}

	selectVideoElement(videoElements: HTMLVideoElement[] | null | undefined): HTMLVideoElement | null {
		if (!Array.isArray(videoElements) || !videoElements.length) {
			return null;
		}

		return videoElements.reduce<HTMLVideoElement | null>((selected, candidate) => {
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

			try {
				const candidateRect = candidate.getBoundingClientRect();
				const selectedRect = selected.getBoundingClientRect();
				const candidateArea = Math.max(0, candidateRect.width) * Math.max(0, candidateRect.height);
				const selectedArea = Math.max(0, selectedRect.width) * Math.max(0, selectedRect.height);
				return candidateArea >= selectedArea ? candidate : selected;
			} catch (error) {
				console.log('[ReWatch][Crunchyroll] Video selection metrics failed:', (error as Error).message);
				return candidate;
			}
		}, null);
	}

	extractTitle(): string | null {
		const selectors = [
			'h1[data-t="title"]',
			'h1.episode-title',
			'.video-player-title h1',
			'meta[property="og:title"]',
			'title'
		];

		for (const selector of selectors) {
			const element = document.querySelector(selector);
			if (!element) {
				continue;
			}

			const text = (element as HTMLMetaElement).content || element.textContent || '';
			const cleaned = text
				.replace(/\s*-\s*Watch on Crunchyroll$/i, '')
				.replace(/\s*\|\s*Crunchyroll$/i, '')
				.trim();
			if (cleaned) {
				return cleaned;
			}
		}

		return null;
	}

	extractEpisodeName(): string | null {
		const selectors = [
			'[data-t="episode-title"]',
			'.episode-title',
			'.video-title',
			'h2[data-t="episode-title"]'
		];

		for (const selector of selectors) {
			const element = document.querySelector(selector);
			if (element && element.textContent) {
				const text = element.textContent.trim();
				if (text && !/^Episode\s+/i.test(text)) {
					return text;
				}
			}
		}

		return null;
	}

	extractEpisodeNumber(): number | null {
		const selectors = [
			'[data-t="episode-number"]',
			'.episode-number',
			'.erc-current-media-info__stats-item--episode',
			'.video-player-details span'
		];

		for (const selector of selectors) {
			const element = document.querySelector(selector);
			if (element && element.textContent) {
				const text = element.textContent;
				const match = text.match(/Episode\s*(\d+)/i) || text.match(/\bE(\d+)\b/i) || text.match(/\d+/);
				if (match) {
					const value = parseInt(match[1] ?? match[0], 10);
					if (Number.isFinite(value)) {
						return value;
					}
				}
			}
		}

		const path = window.location.pathname || '';
		const pathMatch = path.match(/episode-(\d+)/i);
		if (pathMatch) {
			const value = parseInt(pathMatch[1], 10);
			if (Number.isFinite(value)) {
				return value;
			}
		}

		return null;
	}

	extractSeasonNumber(): number | null {
		const selectors = [
			'[data-t="season-number"]',
			'.season-number',
			'.erc-current-media-info__stats-item--season'
		];

		for (const selector of selectors) {
			const element = document.querySelector(selector);
			if (element && element.textContent) {
				const text = element.textContent;
				const match = text.match(/Season\s*(\d+)/i) || text.match(/\bS(\d+)\b/i);
				if (match) {
					const value = parseInt(match[1], 10);
					if (Number.isFinite(value)) {
						return value;
					}
				}
			}
		}

		const path = window.location.pathname || '';
		const pathMatch = path.match(/season-(\d+)/i);
		if (pathMatch) {
			const value = parseInt(pathMatch[1], 10);
			if (Number.isFinite(value)) {
				return value;
			}
		}

		return null;
	}

	getContentType(): 'episode' {
		return 'episode';
	}

	isValidPlaybackPage(metadata?: Record<string, unknown>): boolean {
		const path = window.location.pathname || '';
		if (!/\/watch\//i.test(path)) {
			const fallbackUrl = typeof metadata?.url === 'string' ? metadata.url : null;
			if (!fallbackUrl || !/\/watch\//i.test(fallbackUrl)) {
				return false;
			}
		}

		const hasVideo = Array.from(document.querySelectorAll('video')).some((video) => {
			const duration = Number.isFinite(video.duration) ? video.duration : 0;
			return duration === 0 || duration > 120;
		});

		return hasVideo;
	}
}

const initializeCrunchyrollDetector = () => {
	if (typeof window === 'undefined') {
		return;
	}

	const globalWindow = window as ReWatchWindow;
	const root = globalWindow.ReWatch;
	if (!root) {
		return;
	}

	const registry = root.platformRegistry;
	registry?.registerDetector((hostname) => new CrunchyrollDetector(hostname));
};

initializeCrunchyrollDetector();

export { CrunchyrollDetector };
