import { PlatformDetector } from './base';
import type { ReWatchNamespace } from '../core/namespace';
import type { PlatformRegistry } from '../core/platform-registry';

type ReWatchWindow = typeof window & {
	ReWatch?: ReWatchNamespace & {
		platformRegistry?: PlatformRegistry<PlatformDetector>;
	};
};

type SeasonEpisode = {
	season: number | null;
	episode: number | null;
};

const WATCH_PATH_REGEX = /\/watch\/(movie|tv)\//i;

class BrocoflixDetector extends PlatformDetector {
	private seasonEpisodeCache: SeasonEpisode | null;
	private cacheKey: string | null;

	constructor(hostname: string) {
		super(hostname);
		this.seasonEpisodeCache = null;
		this.cacheKey = null;
	}

	canDetect(): boolean {
		return /(^|\.)brocoflix\./i.test(this.hostname);
	}

	getPlatformName(): string {
		return 'Brocoflix';
	}

	extractTitle(): string | null {
		const selectors = ['h1', 'h2', 'meta[property="og:title"]', 'meta[name="twitter:title"]', 'title'];
		for (const selector of selectors) {
			const element = document.querySelector(selector);
			if (!element) {
				continue;
			}
			const text = element instanceof HTMLMetaElement ? element.content : element.textContent;
			const cleaned = text ? this.cleanTitleText(text) : '';
			if (cleaned) {
				return cleaned;
			}
		}
		return null;
	}

	getContentType(): 'movie' | 'episode' | null {
		const path = window.location.pathname.toLowerCase();
		if (path.includes('/watch/movie/')) {
			return 'movie';
		}
		if (path.includes('/watch/tv/')) {
			return 'episode';
		}
		const search = window.location.search.toLowerCase();
		if (search.includes('episode=') || search.includes('season=')) {
			return 'episode';
		}
		const parsed = this.getSeasonEpisode();
		if (parsed.season !== null || parsed.episode !== null) {
			return 'episode';
		}
		return null;
	}

	extractEpisodeNumber(): number | null {
		return this.getSeasonEpisode().episode;
	}

	extractSeasonNumber(): number | null {
		return this.getSeasonEpisode().season;
	}

	extractEpisodeName(): string | null {
		const selectors = ['[data-testid="episode-title"]', '[data-episode-title]', '[class*="episode-title"]', '[data-testid="episode-name"]', '[class*="episode-name"]'];
		for (const selector of selectors) {
			const element = document.querySelector(selector);
			if (element && element.textContent) {
				const text = element.textContent.trim();
				if (text) {
					return text;
				}
			}
		}
		return null;
	}

	isValidPlaybackPage(): boolean {
		if (!WATCH_PATH_REGEX.test(window.location.pathname)) {
			return false;
		}
		return Boolean(this.extractTitle());
	}

	private getSeasonEpisode(): SeasonEpisode {
		const currentKey = `${window.location.pathname}|${window.location.search}`;
		if (this.cacheKey !== currentKey) {
			this.seasonEpisodeCache = null;
			this.cacheKey = currentKey;
		}
		if (this.seasonEpisodeCache) {
			return this.seasonEpisodeCache;
		}
		const searchParams = new URLSearchParams(window.location.search);
		const seasonParam = this.parseNumber([searchParams.get('season'), searchParams.get('s')]);
		const episodeParam = this.parseNumber([searchParams.get('episode'), searchParams.get('ep')]);
		let result: SeasonEpisode = {
			season: seasonParam,
			episode: episodeParam
		};
		if (result.season !== null && result.episode !== null) {
			this.seasonEpisodeCache = result;
			return result;
		}
		const sources = this.collectSeasonEpisodeSources();
		for (const source of sources) {
			result = this.updateSeasonEpisodeFromSource(result, source);
			if (result.season !== null && result.episode !== null) {
				this.seasonEpisodeCache = result;
				return result;
			}
		}
		if ((result.season === null || result.episode === null) && document.body) {
			const bodyText = document.body.textContent ?? '';
			if (bodyText) {
				result = this.updateSeasonEpisodeFromSource(result, bodyText);
			}
		}
		this.seasonEpisodeCache = result;
		this.cacheKey = currentKey;
		return result;
	}

	private collectSeasonEpisodeSources(): string[] {
		const sources: string[] = [];
		if (document.title) {
			sources.push(document.title);
		}
		const metaSources: Array<[ 'property' | 'name', string ]> = [
			['property', 'og:title'],
			['name', 'twitter:title'],
			['name', 'description'],
			['property', 'og:description']
		];
		for (const [attribute, value] of metaSources) {
			const content = this.getMetaContent(attribute, value);
			if (content) {
				sources.push(content);
			}
		}
		return sources;
	}

	private updateSeasonEpisodeFromSource(current: SeasonEpisode, source: string): SeasonEpisode {
		let season = current.season;
		let episode = current.episode;
		const cleaned = source.replace(/\|\s*Brocoflix/gi, '').trim();
		if (cleaned) {
			const combinedMatch = cleaned.match(/S(?:eason)?\s*(\d{1,3})\s*(?:[-xXeE]?\s*)(?:Episode\s*)?(\d{1,3})/i);
			if (combinedMatch) {
				const parsedSeason = parseInt(combinedMatch[1], 10);
				const parsedEpisode = parseInt(combinedMatch[2], 10);
				if (season === null && Number.isFinite(parsedSeason)) {
					season = parsedSeason;
				}
				if (episode === null && Number.isFinite(parsedEpisode)) {
					episode = parsedEpisode;
				}
			}
			if (season === null) {
				const seasonMatch = cleaned.match(/Season\s*(\d{1,3})/i) ?? cleaned.match(/S\s*(\d{1,3})/i);
				if (seasonMatch) {
					const parsedSeason = parseInt(seasonMatch[1], 10);
					if (Number.isFinite(parsedSeason)) {
						season = parsedSeason;
					}
				}
			}
			if (episode === null) {
				const episodeMatch = cleaned.match(/Episode\s*(\d{1,3})/i) ?? cleaned.match(/E\s*(\d{1,3})/i);
				if (episodeMatch) {
					const parsedEpisode = parseInt(episodeMatch[1], 10);
					if (Number.isFinite(parsedEpisode)) {
						episode = parsedEpisode;
					}
				}
			}
		}
		return {
			season,
			episode
		};
	}

	private parseNumber(values: Array<string | null>): number | null {
		for (const value of values) {
			if (!value) {
				continue;
			}
			const parsed = parseInt(value, 10);
			if (Number.isFinite(parsed)) {
				return parsed;
			}
		}
		return null;
	}

	private getMetaContent(attribute: 'property' | 'name', value: string): string | null {
		const element = document.querySelector(`meta[${attribute}="${value}"]`) as HTMLMetaElement | null;
		if (!element) {
			return null;
		}
		const content = element.content?.trim() ?? '';
		return content ? content : null;
	}

	private cleanTitleText(value: string): string {
		return value.replace(/^Watch\s+Stream\s*-?/i, '').replace(/\|\s*Brocoflix$/i, '').trim();
	}
}

const initializeBrocoflixDetector = () => {
	if (typeof window === 'undefined') {
		return;
	}
	const globalWindow = window as ReWatchWindow;
	const registry = globalWindow.ReWatch?.platformRegistry;
	registry?.registerDetector((hostname) => new BrocoflixDetector(hostname));
};

initializeBrocoflixDetector();

export { BrocoflixDetector };
