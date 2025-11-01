import { PlatformDetector, type EpisodeInference } from './base';
import type { ReWatchNamespace } from '../core/namespace';
import type { PlatformRegistry } from '../core/platform-registry';

type UnknownRecord = Record<string, unknown>;

type NetflixGlobal = {
	reactContext?: unknown;
	playerModel?: unknown;
	falcorCache?: UnknownRecord;
};

type NetflixCore = ReWatchNamespace['core'] & {
	NetflixDetector?: typeof PlatformDetector;
};

type NetflixRoot = ReWatchNamespace & {
	core: NetflixCore;
	platformRegistry?: PlatformRegistry<PlatformDetector>;
};

type NetflixWindow = typeof window & {
	netflix?: NetflixGlobal;
	ReWatch?: NetflixRoot;
};

type NetflixVideoEntry = {
	cache: UnknownRecord;
	videoId: string;
	videoEntry: UnknownRecord;
};

type NetflixParseResult = {
	falcorCache: UnknownRecord | null;
	reactContext: UnknownRecord | null;
};

class NetflixDetector extends PlatformDetector {
	private parsedFalcorCache: UnknownRecord | null;
	private parsedReactContext: UnknownRecord | null;
	private scriptsParsed: boolean;

	constructor(hostname: string) {
		super(hostname);
		this.parsedFalcorCache = null;
		this.parsedReactContext = null;
		this.scriptsParsed = false;
	}

	canDetect(): boolean {
		return this.hostname.includes('netflix');
	}

	getPlatformName(): string {
		return 'Netflix';
	}

	private toRecord(value: unknown): UnknownRecord | null {
		if (!value || typeof value !== 'object') {
			return null;
		}
		return value as UnknownRecord;
	}

	private getNestedValue(source: unknown, path: string): unknown {
		if (!source || typeof source !== 'object') {
			return undefined;
		}
		const keys = path.split('.');
		let cursor: unknown = source;
		for (const key of keys) {
			if (!cursor || typeof cursor !== 'object') {
				return undefined;
			}
			const record = cursor as UnknownRecord;
			if (!(key in record)) {
				return undefined;
			}
			cursor = record[key];
		}
		return cursor;
	}

	private getNetflixMetadata(): UnknownRecord | null {
		const globalWindow = window as NetflixWindow;
		const netflix = globalWindow.netflix;
		try {
			if (netflix?.reactContext) {
				const reactContext = this.toRecord(netflix.reactContext);
				const models = this.toRecord(reactContext?.models);
				const videoPlayer = this.toRecord(models?.videoPlayer);
				const videoPlayerData = this.toRecord(videoPlayer?.data);
				if (videoPlayerData) {
					return videoPlayerData;
				}
			}

			if (netflix?.playerModel) {
				const model = this.toRecord(netflix.playerModel);
				if (model) {
					return model;
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.log('[ReWatch][Netflix] Error accessing metadata:', message);
		}

		const parsed = this.parseEmbeddedNetflixData();
		const reactContext = this.toRecord(parsed.reactContext);
		const models = this.toRecord(reactContext?.models);
		const videoPlayer = this.toRecord(models?.videoPlayer);
		const videoPlayerData = this.toRecord(videoPlayer?.data);
		if (videoPlayerData) {
			return videoPlayerData;
		}
		const playerModel = this.toRecord(models?.playerModel);
		const playerModelData = this.toRecord(playerModel?.data);
		if (playerModelData) {
			return playerModelData;
		}
		return null;
	}

	private getFalcorCache(): UnknownRecord | null {
		const globalWindow = window as NetflixWindow;
		try {
			if (globalWindow.netflix?.falcorCache) {
				return globalWindow.netflix.falcorCache;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.log('[ReWatch][Netflix] Error accessing falcorCache:', message);
		}
		const parsed = this.parseEmbeddedNetflixData();
		return parsed.falcorCache;
	}

	private getCurrentVideoId(): string | null {
		const urlMatch = window.location.pathname.match(/\/watch\/(\d+)/);
		if (urlMatch) {
			return urlMatch[1];
		}

		const cache = this.getFalcorCache();
		const lolomoId = this.getNestedValue(cache, 'lolomo.summary.value.currentVideoId');
		if (typeof lolomoId === 'string' || typeof lolomoId === 'number') {
			return String(lolomoId);
		}

		const sessionId = this.getNestedValue(cache, 'sessionContext.current.value.videoId');
		if (typeof sessionId === 'string' || typeof sessionId === 'number') {
			return String(sessionId);
		}

		return null;
	}

	private getCurrentVideoEntry(): NetflixVideoEntry | null {
		const cache = this.getFalcorCache();
		const videoId = this.getCurrentVideoId();
		if (!cache || !videoId) {
			return null;
		}

		const videos = this.toRecord((cache as { videos?: unknown }).videos);
		if (!videos) {
			return null;
		}

		const entry = this.toRecord(videos[videoId]);
		if (!entry) {
			return null;
		}

		return {
			cache,
			videoId,
			videoEntry: entry
		};
	}

	getContentType(): 'movie' | 'episode' | null {
		const entry = this.getCurrentVideoEntry();
		const summary = this.toRecord(this.getNestedValue(entry?.videoEntry, 'summary.value'));
		if (summary) {
			const typeValue = summary.type;
			const normalizedType = typeof typeValue === 'string' ? typeValue.toLowerCase() : null;
			if (normalizedType === 'episode') {
				return 'episode';
			}
			if (normalizedType === 'movie') {
				return 'movie';
			}
			const episodeValue = summary.episode;
			const seasonValue = summary.season;
			if (Number.isFinite(episodeValue) || Number.isFinite(seasonValue)) {
				return 'episode';
			}
		}

		const metadata = this.getNetflixMetadata();
		if (metadata) {
			const typeCandidates = [
				metadata.type,
				metadata.videoType,
				this.getNestedValue(metadata, 'video.type'),
				this.getNestedValue(metadata, 'video.summary.type'),
				this.getNestedValue(metadata, 'currentVideo.type'),
				this.getNestedValue(metadata, 'currentVideo.summary.type')
			].filter((value): value is string => typeof value === 'string').map((value) => value.toLowerCase());

			if (typeCandidates.includes('episode')) {
				return 'episode';
			}
			if (typeCandidates.includes('movie')) {
				return 'movie';
			}

			const episodeIndicators = [
				metadata.episodeNumber,
				metadata.episode,
				metadata.currentEpisode,
				metadata.episodeTitle,
				metadata.currentEpisodeTitle,
				metadata.episodeName
			];
			if (episodeIndicators.some((value) => typeof value === 'string' || Number.isFinite(value))) {
				return 'episode';
			}
		}

		const title = this.extractTitle();
		if (title) {
			const inferred = this.inferEpisodeInfoFromTitle(title);
			if (inferred) {
				return 'episode';
			}
		}

		return null;
	}

	inferEpisodeInfoFromTitle(title: string | null): EpisodeInference | null {
		if (!title || typeof title !== 'string') {
			return null;
		}

		const normalized = title.replace(/[\u2068\u2069\u202A-\u202E]/g, '').trim();
		if (!normalized) {
			return null;
		}

		const buildResult = (prefix: string | undefined, episodeValue: string | undefined | null, seasonValue: string | undefined | null, suffix: string | undefined): EpisodeInference | null => {
			const result: EpisodeInference = {};

			if (seasonValue !== undefined && seasonValue !== null) {
				const seasonNumber = parseInt(seasonValue, 10);
				if (Number.isFinite(seasonNumber)) {
					result.season = seasonNumber;
				}
			}

			if (episodeValue !== undefined && episodeValue !== null) {
				const episodeNumber = parseInt(episodeValue, 10);
				if (Number.isFinite(episodeNumber)) {
					result.episode = episodeNumber;
				}
			}

			const cleanPrefix = prefix ? prefix.trim().replace(/[\-,–—:|]+$/, '').trim() : '';
			if (cleanPrefix) {
				result.seriesTitle = cleanPrefix;
			}

			const cleanSuffix = suffix ? suffix.trim().replace(/^[\-,–—:|]+/, '').trim() : '';
			if (cleanSuffix) {
				result.episodeName = cleanSuffix;
			}

			return Object.keys(result).length > 0 ? result : null;
		};

		const seasonEpisodeMatch = normalized.match(/(.*?)(?:\bS\s*(\d{1,2})\s*[.:]?\s*E\s*(\d{1,3}))(.*)/i);
		if (seasonEpisodeMatch) {
			const [, prefix, seasonValue, episodeValue, suffix] = seasonEpisodeMatch;
			const result = buildResult(prefix, episodeValue, seasonValue, suffix);
			if (result) {
				return result;
			}
		}

		const episodeWordMatch = normalized.match(/(.*?)(?:\bEpisode\s+(\d{1,3}))(.*)/i);
		if (episodeWordMatch) {
			const [, prefix, episodeValue, suffix] = episodeWordMatch;
			const result = buildResult(prefix, episodeValue, null, suffix);
			if (result) {
				return result;
			}
		}

		const simpleEmatch = normalized.match(/(.*?)(\bE\s*[-.:]?\s*(\d{1,3}))(.*)/i);
		if (simpleEmatch) {
			const prefix = simpleEmatch[1];
			const episodeValue = simpleEmatch[3];
			const suffix = simpleEmatch[4];
			const result = buildResult(prefix, episodeValue, null, suffix);
			if (result) {
				return result;
			}
		}

		return null;
	}

	private parseEmbeddedNetflixData(): NetflixParseResult {
		if (this.scriptsParsed) {
			return {
				falcorCache: this.parsedFalcorCache,
				reactContext: this.parsedReactContext
			};
		}

		this.scriptsParsed = true;

		const scripts = document.querySelectorAll('script');
		for (const script of scripts) {
			const text = script.textContent || '';
			if (!this.parsedFalcorCache) {
				const falcorMatch = text.match(/netflix\.falcorCache\s*=\s*(\{[\s\S]*?\});/);
				if (falcorMatch) {
					this.parsedFalcorCache = this.safeParseNetflixObject(falcorMatch[1]);
				}
			}

			if (!this.parsedReactContext) {
				const reactMatch = text.match(/netflix\.reactContext\s*=\s*(\{[\s\S]*?\});/);
				if (reactMatch) {
					this.parsedReactContext = this.safeParseNetflixObject(reactMatch[1]);
				}
			}

			if (this.parsedFalcorCache && this.parsedReactContext) {
				break;
			}
		}

		if (!this.parsedFalcorCache || !this.parsedReactContext) {
			this.scriptsParsed = false;
		}

		return {
			falcorCache: this.parsedFalcorCache,
			reactContext: this.parsedReactContext
		};
	}

	private safeParseNetflixObject(source: string | null | undefined): UnknownRecord | null {
		if (!source || typeof source !== 'string') {
			return null;
		}

		const candidates = this.buildNetflixParseCandidates(source);

		for (const candidate of candidates) {
			try {
				const parsed = JSON.parse(candidate) as unknown;
				if (parsed && typeof parsed === 'object') {
					return parsed as UnknownRecord;
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.warn('[ReWatch][Netflix] JSON parsing attempt failed:', message);
			}
		}

		const preview = candidates[0] ? candidates[0].slice(0, 200) : '';
		if (preview) {
			console.warn('[ReWatch][Netflix] Unable to parse embedded object after sanitization', { preview });
		} else {
			console.warn('[ReWatch][Netflix] Unable to parse embedded object after sanitization');
		}
		return null;
	}

	private buildNetflixParseCandidates(rawSource: string): string[] {
		const candidates: string[] = [];
		const seen = new Set<string>();

		const addCandidate = (value: string | null | undefined) => {
			const candidate = typeof value === 'string' ? value.trim() : '';
			if (candidate && !seen.has(candidate)) {
				seen.add(candidate);
				candidates.push(candidate);
			}
		};

		addCandidate(rawSource);
		const sanitized = this.sanitizeNetflixObjectLiteral(rawSource);
		addCandidate(sanitized);

		return candidates;
	}

	private sanitizeNetflixObjectLiteral(literal: string): string {
		let sanitized = literal.trim().replace(/;+\s*$/, '');
		sanitized = sanitized.replace(/\\x([0-9A-Fa-f]{2})/g, (_match, hex) => `\\u00${String(hex).toUpperCase()}`);
		sanitized = sanitized.replace(/[\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()}`);
		sanitized = sanitized.replace(/\\([^"\\/bfnrtu])/g, (_match, char) => `\\\\${String(char)}`);
		return sanitized;
	}

	private normalizeNetflixNumber(value: unknown): number | null {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return Math.trunc(value);
		}

		if (typeof value === 'string') {
			const directParse = parseInt(value, 10);
			if (!Number.isNaN(directParse)) {
				return directParse;
			}
			const digitsMatch = value.match(/\d+/);
			if (digitsMatch) {
				const parsed = parseInt(digitsMatch[0], 10);
				if (!Number.isNaN(parsed)) {
					return parsed;
				}
			}
		}

		if (value && typeof value === 'object') {
			const object = value as UnknownRecord;
			const candidates = [object.episode, object.seq, object.number];
			for (const candidate of candidates) {
				const normalized = this.normalizeNetflixNumber(candidate);
				if (normalized !== null && normalized !== undefined) {
					return normalized;
				}
			}
		}

		return null;
	}

	private extractNumericMetadataField(metadata: UnknownRecord, paths: string[]): number | null {
		for (const path of paths) {
			const value = this.getNestedValue(metadata, path);
			const normalized = this.normalizeNetflixNumber(value);
			if (normalized !== null && normalized !== undefined) {
				return normalized;
			}
		}
		return null;
	}

	extractEpisodeNumber(): number | null {
		const entry = this.getCurrentVideoEntry();
		const summaryEpisode = this.getNestedValue(entry?.videoEntry, 'summary.value.episode');
		if (Number.isFinite(summaryEpisode)) {
			const episodeNumber = parseInt(String(summaryEpisode), 10);
			console.log('[ReWatch][Netflix] Found episode number from falcorCache:', episodeNumber);
			return episodeNumber;
		}

		const metadata = this.getNetflixMetadata();
		if (metadata) {
			const episodeFromMetadata = this.extractNumericMetadataField(metadata, [
				'episodeNumber',
				'episode',
				'currentEpisode',
				'playerState.currentEpisode',
				'playerState.episode',
				'video.episode',
				'video.summary.episode',
				'video.currentEpisode',
				'currentVideo.episode',
				'currentVideo.summary.episode',
				'currentVideo.currentEpisode',
				'currentVideoMetadata.episode',
				'currentVideoMetadata.summary.episode',
				'episodeContext.episode'
			]);
			if (episodeFromMetadata !== null && episodeFromMetadata !== undefined) {
				console.log('[ReWatch][Netflix] Found episode number from metadata:', episodeFromMetadata);
				return episodeFromMetadata;
			}
		}

		const inferredFromTitle = this.inferEpisodeInfoFromTitle(this.extractTitle());
		if (inferredFromTitle && Number.isFinite(inferredFromTitle.episode)) {
			console.log('[ReWatch][Netflix] Inferred episode number from title:', inferredFromTitle.episode);
			return inferredFromTitle.episode ?? null;
		}

		const summaryType = this.getNestedValue(entry?.videoEntry, 'summary.value.type');
		if (typeof summaryType === 'string' && summaryType.toLowerCase() === 'movie') {
			return null;
		}

		console.log('[ReWatch][Netflix] No episode number found for current video');
		return null;
	}

	extractSeasonNumber(): number | null {
		const entry = this.getCurrentVideoEntry();
		const summarySeason = this.getNestedValue(entry?.videoEntry, 'summary.value.season');
		if (Number.isFinite(summarySeason)) {
			const seasonNumber = parseInt(String(summarySeason), 10);
			console.log('[ReWatch][Netflix] Found season number from falcorCache:', seasonNumber);
			return seasonNumber;
		}

		const metadata = this.getNetflixMetadata();
		if (metadata) {
			const seasonFromMetadata = this.extractNumericMetadataField(metadata, [
				'seasonNumber',
				'season',
				'currentSeason',
				'playerState.currentSeason',
				'playerState.season',
				'video.season',
				'video.summary.season',
				'currentVideo.season',
				'currentVideo.summary.season',
				'currentVideo.currentSeason',
				'currentVideoMetadata.season',
				'currentVideoMetadata.summary.season',
				'episodeContext.season'
			]);
			if (seasonFromMetadata !== null && seasonFromMetadata !== undefined) {
				console.log('[ReWatch][Netflix] Found season number from metadata:', seasonFromMetadata);
				return seasonFromMetadata;
			}
		}

		const inferredFromTitle = this.inferEpisodeInfoFromTitle(this.extractTitle());
		if (inferredFromTitle && Number.isFinite(inferredFromTitle.season)) {
			console.log('[ReWatch][Netflix] Inferred season number from title:', inferredFromTitle.season);
			return inferredFromTitle.season ?? null;
		}

		const summaryType = this.getNestedValue(entry?.videoEntry, 'summary.value.type');
		if (typeof summaryType === 'string' && summaryType.toLowerCase() === 'movie') {
			return null;
		}

		console.log('[ReWatch][Netflix] No season number found for current video');
		return null;
	}

	extractTitle(): string | null {
		const metadata = this.getNetflixMetadata();
		if (metadata) {
			const metaTitle = metadata.title;
			if (typeof metaTitle === 'string' && metaTitle.trim()) {
				console.log('[ReWatch][Netflix] Found title from metadata:', metaTitle);
				return metaTitle;
			}

			const seriesTitle = metadata.seriesTitle;
			const showTitle = metadata.showTitle;
			const preferred = typeof seriesTitle === 'string' && seriesTitle.trim()
				? seriesTitle
				: typeof showTitle === 'string' && showTitle.trim()
					? showTitle
					: null;
			if (preferred) {
				console.log('[ReWatch][Netflix] Found series title from metadata:', preferred);
				return preferred;
			}
		}

		const entry = this.getCurrentVideoEntry();
		const summaryType = this.getNestedValue(entry?.videoEntry, 'summary.value.type');
		const isMovie = typeof summaryType === 'string' && summaryType.toLowerCase() === 'movie';
		const falcorTitle = this.getNestedValue(entry?.videoEntry, 'title.value');
		if (isMovie && typeof falcorTitle === 'string' && falcorTitle.trim()) {
			console.log('[ReWatch][Netflix] Found movie title from falcorCache:', falcorTitle);
			return falcorTitle;
		}

		const docTitle = document.title;
		if (docTitle && docTitle !== 'Netflix') {
			const cleanTitle = docTitle.replace(/\s*-\s*Netflix\s*$/i, '').trim();
			if (cleanTitle) {
				console.log('[ReWatch][Netflix] Found title from document.title:', cleanTitle);
				return cleanTitle;
			}
		}

		return null;
	}

	extractEpisodeName(): string | null {
		const metadata = this.getNetflixMetadata();
		if (metadata) {
			const episodeTitle = metadata.episodeTitle;
			if (typeof episodeTitle === 'string' && episodeTitle.trim()) {
				console.log('[ReWatch][Netflix] Found episode name from metadata:', episodeTitle);
				return episodeTitle;
			}

			const currentEpisodeTitle = metadata.currentEpisodeTitle;
			if (typeof currentEpisodeTitle === 'string' && currentEpisodeTitle.trim()) {
				console.log('[ReWatch][Netflix] Found episode name from currentEpisodeTitle:', currentEpisodeTitle);
				return currentEpisodeTitle;
			}
		}

		return null;
	}

	isValidPlaybackPage(): boolean {
		const htmlElement = document.documentElement;
		if (!htmlElement.classList.contains('watch-video-root')) {
			console.log('[ReWatch][Netflix] Not on watch page - likely a preview/browse page');
			return false;
		}

		if (!/\/watch\/\d+/i.test(window.location.pathname)) {
			console.log('[ReWatch][Netflix] URL does not contain /watch/ - not a playback page');
			return false;
		}

		const playerContainer = document.querySelector('[data-uia="watch-video"], .watch-video');
		if (!playerContainer) {
			console.log('[ReWatch][Netflix] Missing watch-video container - likely an info page');
			return false;
		}

		const player = playerContainer.querySelector('[data-uia="player"], video');
		if (!player) {
			console.log('[ReWatch][Netflix] Player element missing inside watch-video container');
			return false;
		}

		return true;
	}
}

const initializeNetflixDetector = () => {
	if (typeof window === 'undefined') {
		return;
	}

	const globalWindow = window as NetflixWindow;
	const root = globalWindow.ReWatch;
	if (!root) {
		return;
	}

	root.platformRegistry?.registerDetector((hostname) => new NetflixDetector(hostname));
	const core = root.core as NetflixCore;
	core.NetflixDetector = NetflixDetector;
};

initializeNetflixDetector();

export { NetflixDetector };
