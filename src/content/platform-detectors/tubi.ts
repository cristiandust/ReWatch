import { PlatformDetector } from './base';
import type { ReWatchNamespace } from '../core/namespace';
import type { PlatformRegistry } from '../core/platform-registry';

type ReWatchWindow = typeof window & {
	ReWatch?: ReWatchNamespace & {
		platformRegistry?: PlatformRegistry<PlatformDetector>;
	};
};

const MIN_DURATION_SECONDS = 60;

class TubiDetector extends PlatformDetector {
	canDetect(): boolean {
		return /(^|\.)tubitv\.com$/i.test(this.hostname);
	}

	getPlatformName(): string {
		return 'Tubi';
	}

	filterVideoElements(videoElements: HTMLVideoElement[] | null | undefined): HTMLVideoElement[] {
		if (!Array.isArray(videoElements)) {
			return [];
		}

		return videoElements.filter((video) => {
			if (!video) {
				return false;
			}

			const parent = video.closest('[data-testid="ad-player"], [data-testid="adPlayer"], .ads, .ad-container');
			if (parent) {
				return false;
			}

			const classTokens = Array.from(video.classList || []).join(' ').toLowerCase();
			if (classTokens.includes('ad') && !classTokens.includes('main')) {
				return false;
			}

			const duration = Number.isFinite(video.duration) ? video.duration : NaN;
			if (Number.isFinite(duration) && duration > 0 && duration < MIN_DURATION_SECONDS) {
				return false;
			}

			return true;
		});
	}

	selectVideoElement(videoElements: HTMLVideoElement[] | null | undefined): HTMLVideoElement | null {
		if (!Array.isArray(videoElements) || videoElements.length === 0) {
			return null;
		}

		return videoElements.reduce<HTMLVideoElement | null>((selected, candidate) => {
			if (!candidate) {
				return selected;
			}
			if (!selected) {
				return candidate;
			}

			const candidateDuration = Number.isFinite(candidate.duration) ? candidate.duration : 0;
			const selectedDuration = Number.isFinite(selected.duration) ? selected.duration : 0;

			if (candidateDuration !== selectedDuration) {
				return candidateDuration > selectedDuration ? candidate : selected;
			}

			try {
				const candidateRect = candidate.getBoundingClientRect();
				const selectedRect = selected.getBoundingClientRect();
				const candidateArea = Math.max(0, candidateRect.width) * Math.max(0, candidateRect.height);
				const selectedArea = Math.max(0, selectedRect.width) * Math.max(0, selectedRect.height);
				return candidateArea >= selectedArea ? candidate : selected;
			} catch (error) {
				console.log('[ReWatch][Tubi] Video selection metrics failed:', (error as Error).message);
				return candidate;
			}
		}, null);
	}

	extractTitle(): string | null {
		const selectors = ['[data-testid="videoTitle"]', 'h1[data-testid="title"]', 'meta[property="og:title"]', 'meta[name="title"]', 'title'];

		for (const selector of selectors) {
			const element = document.querySelector(selector);
			if (!element) {
				continue;
			}

			const metaElement = element as HTMLMetaElement;
			const text = metaElement.content ?? element.textContent ?? '';
			const cleaned = text.replace(/\s*\|\s*Tubi$/i, '').trim();
			if (cleaned) {
				return cleaned;
			}
		}

		return null;
	}

	extractEpisodeName(): string | null {
		const subtitle = document.querySelector('[data-testid="videoSubtitle"], [data-testid="videoSubTitle"]');
		if (!subtitle || !subtitle.textContent) {
			return null;
		}

		const text = subtitle.textContent.trim();
		if (!text.length || /Season\s+\d+/i.test(text)) {
			return null;
		}

		return text;
	}

	extractEpisodeNumber(): number | null {
		const path = window.location.pathname;
		const match = path.match(/s(\d+)-e(\d+)/i) || path.match(/episode-(\d+)/i);
		if (match) {
			const episodeValue = match[2] ?? match[1];
			const parsed = parseInt(episodeValue ?? '', 10);
			if (Number.isFinite(parsed)) {
				return parsed;
			}
		}

		const episodeElement = document.querySelector('[data-testid="episodeNumber"], .episode-number');
		if (episodeElement && episodeElement.textContent) {
			const episodeMatch = episodeElement.textContent.match(/\d+/);
			if (episodeMatch) {
				const parsed = parseInt(episodeMatch[0], 10);
				if (Number.isFinite(parsed)) {
					return parsed;
				}
			}
		}

		return null;
	}

	extractSeasonNumber(): number | null {
		const path = window.location.pathname;
		const match = path.match(/s(\d+)-e\d+/i);
		if (match) {
			const parsed = parseInt(match[1], 10);
			if (Number.isFinite(parsed)) {
				return parsed;
			}
		}

		const seasonElement = document.querySelector('[data-testid="seasonNumber"], .season-number');
		if (seasonElement && seasonElement.textContent) {
			const seasonMatch = seasonElement.textContent.match(/\d+/);
			if (seasonMatch) {
				const parsed = parseInt(seasonMatch[0], 10);
				if (Number.isFinite(parsed)) {
					return parsed;
				}
			}
		}

		return null;
	}

	getContentType(): 'movie' | 'episode' {
		const path = window.location.pathname || '';
		if (/\/series\//i.test(path) || /s\d+-e\d+/i.test(path)) {
			return 'episode';
		}
		return 'movie';
	}

	isValidPlaybackPage(): boolean {
		const titleExists = Boolean(
			document.querySelector(
				'[data-testid="videoTitle"], h1[data-testid="title"], meta[property="og:title"], meta[name="title"]'
			)
		);
		const hasPlayableVideo = Array.from(document.querySelectorAll('video')).some((video) => {
			const duration = Number.isFinite(video.duration) ? video.duration : 0;
			return duration === 0 || duration > MIN_DURATION_SECONDS;
		});

		return titleExists && hasPlayableVideo;
	}
}

const initializeTubiDetector = () => {
	if (typeof window === 'undefined') {
		return;
	}

	const globalWindow = window as ReWatchWindow;
	const root = globalWindow.ReWatch;
	if (!root) {
		return;
	}

	const registry = root.platformRegistry;
	registry?.registerDetector((hostname) => new TubiDetector(hostname));
};

initializeTubiDetector();

export { TubiDetector };
