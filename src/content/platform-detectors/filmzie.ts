import { PlatformDetector } from './base';
import type { ReWatchNamespace } from '../core/namespace';
import type { PlatformRegistry } from '../core/platform-registry';

type ReWatchWindow = typeof window & {
	ReWatch?: ReWatchNamespace & {
		platformRegistry?: PlatformRegistry<PlatformDetector>;
	};
};

const MIN_DURATION_SECONDS = 300;

class FilmzieDetector extends PlatformDetector {
	static identifier = 'FilmzieDetector';

	canDetect(): boolean {
		return /(^|\.)filmzie\.(com|tv)$/i.test(this.hostname);
	}

	getPlatformName(): string {
		return 'Filmzie';
	}

	filterVideoElements(videoElements: HTMLVideoElement[] | null | undefined): HTMLVideoElement[] {
		if (!Array.isArray(videoElements)) {
			return [];
		}

		return videoElements.filter((video) => {
			if (!video) {
				return false;
			}

			const duration = Number.isFinite(video.duration) ? video.duration : NaN;
			if (Number.isFinite(duration) && duration > 0 && duration < MIN_DURATION_SECONDS) {
				return false;
			}

			const parent = video.closest('.ad-player, .ads, [data-testid="ad-player"], .jw-ads');
			if (parent) {
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
				console.log('[ReWatch][Filmzie] Video selection metrics failed:', (error as Error).message);
				return candidate;
			}
		}, null);
	}

	extractTitle(): string | null {
		const selectors = ['h1[data-testid="title"]', 'h1', '.movie-title', 'meta[property="og:title"]', 'meta[name="title"]', 'title'];

		for (const selector of selectors) {
			const element = document.querySelector(selector);
			if (!element) {
				continue;
			}

			const metaElement = element as HTMLMetaElement;
			const text = metaElement.content ?? element.textContent ?? '';
			const cleaned = text.replace(/\s*\|\s*Filmzie$/i, '').trim();
			if (cleaned) {
				return cleaned;
			}
		}

		return null;
	}

	getContentType(): 'movie' | 'episode' {
		const path = window.location.pathname || '';
		if (/\/series\//i.test(path) || /season/i.test(path)) {
			return 'episode';
		}
		return 'movie';
	}

	isValidPlaybackPage(): boolean {
		const path = window.location.pathname || '';
		const normalizedPath = path.trim().toLowerCase();
		const hasVideo = Array.from(document.querySelectorAll('video')).some((video) => {
			const duration = Number.isFinite(video.duration) ? video.duration : 0;
			return duration === 0 || duration >= MIN_DURATION_SECONDS;
		});

		if (!hasVideo) {
			return false;
		}

		if (/\/(watch|movie|series|film|content|title|play)\b/i.test(path)) {
			return true;
		}

		if (!normalizedPath || normalizedPath === '/' || /^\/(home|discover|browse|category|categories|genre|genres)\b/.test(normalizedPath)) {
			return false;
		}

		const hasPlayerContainer = Boolean(document.querySelector('.video-js video, .video-js, [data-testid="player"], [data-testid="video-player"], [data-testid="content-player"], [data-testid="watch-player"]'));
		return hasPlayerContainer;
	}
}

const initializeFilmzieDetector = () => {
	if (typeof window === 'undefined') {
		return;
	}

	const globalWindow = window as ReWatchWindow;
	const root = globalWindow.ReWatch;
	if (!root) {
		return;
	}

	const registry = root.platformRegistry;
	registry?.registerDetector((hostname) => new FilmzieDetector(hostname));
};

initializeFilmzieDetector();

export { FilmzieDetector };
