import { PlatformDetector } from './base';
import type { ReWatchNamespace } from '../core/namespace';
import type { PlatformRegistry } from '../core/platform-registry';

type UnknownRecord = Record<string, unknown>;

type PlexWindow = typeof window & {
	ReWatch?: ReWatchNamespace & {
		platformRegistry?: PlatformRegistry<PlatformDetector>;
	};
	__INITIAL_STATE__?: unknown;
	__PRELOADED_STATE__?: unknown;
	__PlexAppInitialState?: unknown;
	__PLEX_INITIAL_STATE__?: unknown;
};

const MIN_DURATION_SECONDS = 90;

class PlexDetector extends PlatformDetector {
	private structuredData: UnknownRecord | null;
	private structuredDataParsed: boolean;

	constructor(hostname: string) {
		super(hostname);
		this.structuredData = null;
		this.structuredDataParsed = false;
	}

	canDetect(): boolean {
		return /(^|\.)plex\.tv$/i.test(this.hostname);
	}

	getPlatformName(): string {
		return 'Plex';
	}

	private toRecord(value: unknown): UnknownRecord | null {
		if (!value || typeof value !== 'object') {
			return null;
		}
		return value as UnknownRecord;
	}

	private toStringValue(value: unknown): string | null {
		if (typeof value === 'string') {
			return value;
		}
		return null;
	}

	private parseNumeric(value: unknown): number | null {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === 'string') {
			const match = value.match(/\d+/);
			if (match) {
				const parsed = parseInt(match[0], 10);
				if (Number.isFinite(parsed)) {
					return parsed;
				}
			}
		}
		return null;
	}

	private extractStructuredEntry(source: unknown): UnknownRecord | null {
		if (Array.isArray(source)) {
			for (const item of source) {
				const candidate = this.extractStructuredEntry(item);
				if (candidate) {
					return candidate;
				}
			}
			return null;
		}

		const record = this.toRecord(source);
		if (!record) {
			return null;
		}

		const typeValue = this.toStringValue(record['@type']);
		if (typeValue === 'TVEpisode' || typeValue === 'Movie') {
			return record;
		}

		return null;
	}

	private extractMetadataFromGlobal(source: unknown): UnknownRecord | null {
		const record = this.toRecord(source);
		if (!record) {
			return null;
		}

		const keys = ['metadata', 'playback', 'item', 'currentMetadata'];
		for (const key of keys) {
			if (key in record) {
				const candidate = this.toRecord(record[key]);
				if (candidate) {
					return candidate;
				}
			}
		}

		return null;
	}

	private parseStructuredData(): UnknownRecord | null {
		if (this.structuredDataParsed) {
			return this.structuredData;
		}

		this.structuredDataParsed = true;

		const scripts = document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"], script[type="application/json"][data-state], script[type="application/json"][data-qa-id="metadata-json"]');
		for (const script of scripts) {
			const text = script.textContent ?? '';
			if (!text.trim()) {
				continue;
			}
			try {
				const parsed = JSON.parse(text) as unknown;
				const entry = this.extractStructuredEntry(parsed);
				if (entry) {
					this.structuredData = entry;
					break;
				}
			} catch (_error) {
				continue;
			}
		}

		if (!this.structuredData) {
			const globalWindow = window as PlexWindow;
			const globals = [globalWindow.__INITIAL_STATE__, globalWindow.__PRELOADED_STATE__, globalWindow.__PlexAppInitialState, globalWindow.__PLEX_INITIAL_STATE__];
			for (const candidate of globals) {
				const metadata = this.extractMetadataFromGlobal(candidate);
				if (metadata) {
					this.structuredData = metadata;
					break;
				}
			}
		}

		return this.structuredData;
	}

	filterVideoElements(videoElements: HTMLVideoElement[] | null | undefined): HTMLVideoElement[] {
		if (!Array.isArray(videoElements)) {
			return [];
		}

		return videoElements.filter((video) => {
			if (!video) {
				return false;
			}

			const container = video.closest('[data-qa-id="ad-player"], .ad-container, .commercial, .adzone');
			if (container) {
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

			const candidateReady = Number.isFinite(candidate.readyState) ? candidate.readyState : 0;
			const selectedReady = Number.isFinite(selected.readyState) ? selected.readyState : 0;
			if (candidateReady !== selectedReady) {
				return candidateReady > selectedReady ? candidate : selected;
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
			} catch (_error) {
				return candidate;
			}
		}, null);
	}

	extractTitle(): string | null {
		const structured = this.parseStructuredData();
		if (structured) {
			const series = this.toRecord(structured['series']);
			const seriesName = this.toStringValue(series?.name);
			if (seriesName) {
				return seriesName.trim();
			}

			const name = this.toStringValue(structured['name']);
			if (name) {
				return name.trim();
			}
		}

		const selectors = ['[data-qa-id="metadata-grandparent-title"]', '[data-qa-id="metadata-title"]', '.MetadataPosterCard-title', '.PrePlayPage-title', 'meta[property="og:title"]', 'title'];
		for (const selector of selectors) {
			const element = document.querySelector(selector);
			if (!element) {
				continue;
			}

			const metaElement = element as HTMLMetaElement;
			const text = metaElement.content ?? element.textContent ?? '';
			const cleaned = text.replace(/\s*\|\s*Plex$/i, '').trim();
			if (cleaned) {
				return cleaned;
			}
		}

		return null;
	}

	extractEpisodeName(): string | null {
		const structured = this.parseStructuredData();
		if (structured) {
			const typeValue = this.toStringValue(structured['@type']);
			if (typeValue === 'TVEpisode') {
				const name = this.toStringValue(structured['name']);
				if (name) {
					return name.trim();
				}
			}
		}

		const selectors = ['[data-qa-id="metadata-title"]', '[data-qa-id="metadata-children-title"]', '.MetadataPosterCard-title', '.PrePlayPage-title'];
		for (const selector of selectors) {
			const element = document.querySelector(selector);
			if (element && element.textContent) {
				const text = element.textContent.trim();
				if (text && text.length < 300) {
					return text;
				}
			}
		}

		return null;
	}

	private extractIndexFromElement(selector: string, pattern: RegExp): number | null {
		const element = document.querySelector(selector);
		if (!element || !element.textContent) {
			return null;
		}

		const match = element.textContent.match(pattern) ?? element.textContent.match(/\d+/);
		if (!match) {
			return null;
		}

		const value = match[1] ?? match[0];
		const parsed = parseInt(value, 10);
		if (Number.isFinite(parsed)) {
			return parsed;
		}

		return null;
	}

	extractEpisodeNumber(): number | null {
		const structured = this.parseStructuredData();
		if (structured) {
			const candidate = this.parseNumeric(structured['episodeNumber']) ?? this.parseNumeric(structured['episode']) ?? this.parseNumeric(structured['episodeNumberEnd']);
			if (candidate !== null) {
				return candidate;
			}
		}

		const selectors = ['[data-qa-id="metadata-episode-index"]', '[data-qa-id="metadata-children-index"]', '[data-qa-id="metadata-index"]', '.PrePlayPage-episodeBadge', '.MetadataPosterCard-episodeBadge'];
		for (const selector of selectors) {
			const value = this.extractIndexFromElement(selector, /Episode\s*(\d+)/i);
			if (value !== null) {
				return value;
			}
		}

		const title = document.title || '';
		const match = title.match(/E(\d+)/i);
		if (match) {
			const parsed = parseInt(match[1], 10);
			if (Number.isFinite(parsed)) {
				return parsed;
			}
		}

		return null;
	}

	extractSeasonNumber(): number | null {
		const structured = this.parseStructuredData();
		if (structured) {
			const partOfSeason = this.toRecord(structured['partOfSeason']);
			const candidate = this.parseNumeric(partOfSeason?.seasonNumber) ?? this.parseNumeric(partOfSeason?.name) ?? this.parseNumeric(structured['seasonNumber']) ?? this.parseNumeric(structured['season']);
			if (candidate !== null) {
				return candidate;
			}
		}

		const selectors = ['[data-qa-id="metadata-parent-index"]', '[data-qa-id="metadata-grandparent-index"]', '.PrePlayPage-seasonBadge', '.MetadataPosterCard-seasonBadge'];
		for (const selector of selectors) {
			const value = this.extractIndexFromElement(selector, /Season\s*(\d+)/i);
			if (value !== null) {
				return value;
			}
		}

		const title = document.title || '';
		const match = title.match(/S(\d+)/i);
		if (match) {
			const parsed = parseInt(match[1], 10);
			if (Number.isFinite(parsed)) {
				return parsed;
			}
		}

		return null;
	}

	getContentType(): 'movie' | 'episode' {
		const structured = this.parseStructuredData();
		if (structured) {
			const typeValue = this.toStringValue(structured['@type']);
			if (typeValue === 'TVEpisode') {
				return 'episode';
			}
		}

		const season = this.extractSeasonNumber();
		const episode = this.extractEpisodeNumber();
		if (season !== null || episode !== null) {
			return 'episode';
		}

		return 'movie';
	}

	isValidPlaybackPage(): boolean {
		const hasVideo = Array.from(document.querySelectorAll('video')).some((video) => {
			const duration = Number.isFinite(video.duration) ? video.duration : 0;
			return duration === 0 || duration > MIN_DURATION_SECONDS;
		});
		if (!hasVideo) {
			return false;
		}

		const path = window.location.pathname || '';
		if (/\/watch\//i.test(path) || /\/preplay\//i.test(path) || /\/server\//i.test(path)) {
			return true;
		}

		return Boolean(document.querySelector('[data-qa-id="metadata-title"], [data-qa-id="metadata-grandparent-title"], meta[property="og:title"]'));
	}
}

const initializePlexDetector = () => {
	if (typeof window === 'undefined') {
		return;
	}

	const globalWindow = window as PlexWindow;
	const root = globalWindow.ReWatch;
	if (!root) {
		return;
	}

	const registry = root.platformRegistry;
	registry?.registerDetector((hostname) => new PlexDetector(hostname));
};

initializePlexDetector();

export { PlexDetector };
