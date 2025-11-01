import { PlatformDetector } from './base';
import type { ReWatchNamespace } from '../core/namespace';
import type { PlatformRegistry } from '../core/platform-registry';

type DomModule = {
	findAcrossAllRoots: typeof import('../core/dom')['findAcrossAllRoots'];
	findAllVideoElements: typeof import('../core/dom')['findAllVideoElements'];
	getElementNode: typeof import('../core/dom')['getElementNode'];
	isNodeInUpNextSection: (node: Node | null) => boolean;
	isNodeVisible: (node: Node | null) => boolean;
	shouldSkipTitleNode: (node: Node | null) => boolean;
};

type ConstantsMap = {
	UP_NEXT_KEYWORDS: readonly string[];
	MINIMUM_CLIP_DURATION_SECONDS: number;
};

type DisneyPlusRoot = ReWatchNamespace & {
	core: ReWatchNamespace['core'] & {
		dom?: DomModule;
	};
	constants?: Partial<ConstantsMap>;
	platformRegistry?: PlatformRegistry<PlatformDetector>;
};

type DisneyPlusWindow = typeof window & {
	ReWatch?: DisneyPlusRoot;
};

type SeasonEpisodeInfo = {
	season?: number;
	episode?: number;
};

class DisneyPlusDetector extends PlatformDetector {
	canDetect(): boolean {
		return this.hostname.includes('disneyplus');
	}

	getPlatformName(): string {
		return 'Disney+';
	}

	filterVideoElements(videoElements: HTMLVideoElement[] | null | undefined): HTMLVideoElement[] {
		if (!Array.isArray(videoElements) || videoElements.length === 0) {
			return [];
		}

		const filtered: HTMLVideoElement[] = [];

		for (const video of videoElements) {
			if (!video) {
				continue;
			}

			try {
				if (this.isIgnoredNode(video) || this.isWithinUpNext(video)) {
					continue;
				}

				const duration = Number.isFinite(video.duration) ? video.duration : null;
				const isShortClip = duration !== null && duration > 0 && duration < 60;
				const getAttr = (element: Element | null, attribute: string): string => {
					if (!element || typeof element.getAttribute !== 'function') {
						return '';
					}
					const value = element.getAttribute(attribute);
					return value ? value.toLowerCase() : '';
				};
				const dataTestId = getAttr(video, 'data-testid');
				const classTokens = video.classList ? Array.from(video.classList).map((cls) => (cls || '').toLowerCase()) : [];
				const parentTestId = getAttr(video.parentElement, 'data-testid');
				const looksLikePromo = (
					(dataTestId && /promo|tile|brand-set|rails?-video/.test(dataTestId)) ||
					classTokens.some((cls) => /promo|tile-video|sizzle|brand-set|brandset/.test(cls)) ||
					(parentTestId && /promo|tile|brand-set/.test(parentTestId))
				);

				if (isShortClip && (video.loop || looksLikePromo || !this.isWithinPlaybackView(video))) {
					continue;
				}

				if (!this.isWithinPlaybackView(video) && (isShortClip || looksLikePromo)) {
					continue;
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch][Disney+] Error while filtering video candidates:', message);
				continue;
			}

			filtered.push(video);
		}

		return filtered.length ? filtered : videoElements;
	}

	selectVideoElement(videoElements: HTMLVideoElement[] | null | undefined): HTMLVideoElement | null {
		if (!Array.isArray(videoElements) || videoElements.length === 0) {
			return null;
		}

		const haveMetadata = (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.HAVE_METADATA) || 1;
		const info = this.collectSeasonEpisodeInfo();
		const path = window.location.pathname || '';
		const contentType = this.determineContentType(info, path);
		const scored = videoElements.map((video) => {
			let score = 0;

			try {
				const rect = video.getBoundingClientRect();
				const area = Math.max(0, rect.width) * Math.max(0, rect.height);
				if (area > 0) {
					score += Math.min(area / 4000, 40);
				}
			} catch (error) {
				console.log('[ReWatch][Disney+] Error measuring video candidate:', (error as Error).message);
			}

			const readyState = Number.isFinite(video.readyState) ? video.readyState : 0;
			if (readyState >= haveMetadata) {
				score += 40;
			}
			if (readyState > haveMetadata) {
				score += 15;
			}

			const duration = Number.isFinite(video.duration) ? video.duration : NaN;
			const constants = this.getConstants();
			if (Number.isFinite(duration)) {
				if (constants && duration >= constants.MINIMUM_CLIP_DURATION_SECONDS) {
					score += 80;
				} else if (duration >= 120) {
					score += 20;
				} else if (duration > 0) {
					score += 5;
				}
			}

			if (video.buffered && typeof video.buffered.length === 'number' && video.buffered.length > 0) {
				score += 10;
			}

			const currentSrc = typeof video.currentSrc === 'string' ? video.currentSrc : '';
			if (currentSrc.startsWith('blob:')) {
				score += 25;
			} else if (/disney|bamgrid/.test(currentSrc)) {
				score += 15;
			}

			if (contentType === 'episode' && this.isSeriesVideoCandidate(video)) {
				score += 30;
			}

			if (contentType === 'movie' && this.isMovieVideoCandidate(video)) {
				score += 30;
			}

			if (this.isWithinPlaybackView(video)) {
				score += 35;
			}

			if (video.autoplay && !video.loop) {
				score += 5;
			}

			return { video, score };
		}).sort((a, b) => b.score - a.score);

		const best = scored[0];
		if (!best || !best.video) {
			return null;
		}

		if (best.score <= 0 && videoElements.length > 0) {
			return videoElements[0];
		}

		return best.video;
	}

	extractEpisodeNumber(): number | null {
		const info = this.collectSeasonEpisodeInfo();
		return info && Number.isFinite(info.episode) ? parseInt(String(info.episode), 10) : null;
	}

	extractSeasonNumber(): number | null {
		const info = this.collectSeasonEpisodeInfo();
		return info && Number.isFinite(info.season) ? parseInt(String(info.season), 10) : null;
	}

	extractTitle(): string | null {
		const dom = this.getDom();
		if (!dom) {
			return null;
		}

		const selectors = [
			'[data-testid="playback-title"]',
			'[data-testid="player-title"]',
			'[data-testid="title"]',
			'[data-testid="hero-image-title"]',
			'h1[data-testid]',
			'h1[class*="Title"]',
			'h1',
			'.title-bug-area .title-field span',
			'.title-bug-container .title-field span',
			'.title-field span',
			'.title-field'
		];

		const constants = this.getConstants();

		const extracted = dom.findAcrossAllRoots(selectors, (node) => {
			const element = dom.getElementNode(node);
			if (!element || !element.textContent) {
				return null;
			}

			if (!dom.isNodeVisible(element) || dom.isNodeInUpNextSection(element)) {
				return null;
			}

			if (this.isIgnoredNode(element) || dom.shouldSkipTitleNode(element)) {
				return null;
			}

			const text = element.textContent.trim();
			if (!text || text.length <= 1 || /^disney\+?$/i.test(text)) {
				return null;
			}

			const normalized = text.toLowerCase();
			if (
				normalized === 'audio' ||
				normalized === 'audio and subtitles' ||
				normalized === 'audio & subtitles' ||
				normalized === 'subtitles' ||
				normalized === 'settings'
			) {
				return null;
			}

			if (constants && (
				normalized.includes('cookie preference center') ||
				normalized.includes('cookie preferences') ||
				normalized.includes('privacy preference center')
			)) {
				return null;
			}

			return text
				.replace(/\s*[•|]\s*Disney\+?$/i, '')
				.replace(/\s*\|\s*Disney\+?$/i, '')
				.trim();
		});

		if (extracted) {
			return extracted;
		}

		const docTitle = document.title;
		if (docTitle) {
			const clean = docTitle.replace(/\s*[•|]\s*Disney\+?$/i, '').trim();
			if (
				clean &&
				!/^disney\+?$/i.test(clean) &&
				!(constants && constants.UP_NEXT_KEYWORDS.some((keyword) => clean.toLowerCase().includes(keyword))) &&
				!clean.toLowerCase().includes('cookie preference center') &&
				!clean.toLowerCase().includes('cookie preferences') &&
				!clean.toLowerCase().includes('privacy preference center')
			) {
				return clean;
			}
		}

		return null;
	}

	extractEpisodeName(): string | null {
		const dom = this.getDom();
		const constants = this.getConstants();
		if (!dom || !constants) {
			return null;
		}

		const selectors = [
			'[data-testid="playback-subtitle"]',
			'[data-testid="player-subtitle"]',
			'[data-testid="subtitle"]',
			'[class*="EpisodeTitle"]',
			'[class*="episodeTitle"]',
			'.title-bug-area .subtitle-field span',
			'.title-bug-container .subtitle-field span',
			'.subtitle-field span',
			'.subtitle-field'
		];

		const extracted = dom.findAcrossAllRoots(selectors, (node) => {
			const element = dom.getElementNode(node);
			if (!element || !element.textContent) {
				return null;
			}

			if (!dom.isNodeVisible(element) || dom.isNodeInUpNextSection(element)) {
				return null;
			}

			if (this.isIgnoredNode(element) || dom.shouldSkipTitleNode(element)) {
				return null;
			}

			let text = element.textContent.trim();
			if (!text) {
				return null;
			}

			if (constants.UP_NEXT_KEYWORDS.some((keyword) => text.toLowerCase().includes(keyword))) {
				return null;
			}

			const info = this.parseSeasonEpisode(text);
			if (info) {
				text = text
					.replace(/\bS(?:eason)?\s*\d{1,2}\s*(?:[:E]|Episode)\s*\d{1,3}/i, '')
					.replace(/Season\s+\d{1,2}.*Episode\s+\d{1,3}/i, '')
					.replace(/Episode\s+\d{1,3}/i, '')
					.replace(/E\s*\d{1,3}/i, '')
					.replace(/^[•\-\—:\s]+/, '')
					.trim();
			}

			if (text && text.length > 1 && text.length < 150) {
				return text;
			}

			return null;
		});

		return extracted ?? null;
	}

	getContentType(): 'movie' | 'episode' | null {
		const info = this.collectSeasonEpisodeInfo();
		const path = window.location.pathname || '';
		return this.determineContentType(info, path);
	}

	isValidPlaybackPage(): boolean {
		const dom = this.getDom();
		if (!dom) {
			return false;
		}

		const path = window.location.pathname || '';
		const videoElements = dom.findAllVideoElements();
		const info = this.collectSeasonEpisodeInfo();
		const contentType = this.determineContentType(info, path);
		const playbackRoot = this.getPlaybackRoot();
		const hasVisiblePlaybackRoot = playbackRoot ? dom.isNodeVisible(playbackRoot) : false;
		const isPlaybackRoute = /\/video\//i.test(path) || this.isMovieRoute(path) || this.isSeriesRoute(path);

		if (!isPlaybackRoute && !hasVisiblePlaybackRoot) {
			return false;
		}

		if (this.isValidSeriesPlayback(videoElements, path, info, contentType)) {
			return true;
		}

		if (this.isValidMoviePlayback(videoElements, path, info, contentType)) {
			return true;
		}

		return Array.isArray(videoElements) && videoElements.length > 0;
	}

	private getRoot(): DisneyPlusRoot | null {
		if (typeof window === 'undefined') {
			return null;
		}

		const globalWindow = window as DisneyPlusWindow;
		return globalWindow.ReWatch ?? null;
	}

	private getDom(): DomModule | null {
		const root = this.getRoot();
		const dom = root?.core?.dom;
		if (!dom) {
			return null;
		}

		if (
			typeof dom.findAcrossAllRoots !== 'function' ||
			typeof dom.findAllVideoElements !== 'function' ||
			typeof dom.getElementNode !== 'function' ||
			typeof dom.isNodeInUpNextSection !== 'function' ||
			typeof dom.isNodeVisible !== 'function' ||
			typeof dom.shouldSkipTitleNode !== 'function'
		) {
			return null;
		}

		return dom;
	}

	private getConstants(): ConstantsMap | null {
		const root = this.getRoot();
		const constants = root?.constants;
		if (!constants) {
			return null;
		}

		if (!Array.isArray(constants.UP_NEXT_KEYWORDS) || typeof constants.MINIMUM_CLIP_DURATION_SECONDS !== 'number') {
			return null;
		}

		return {
			UP_NEXT_KEYWORDS: constants.UP_NEXT_KEYWORDS,
			MINIMUM_CLIP_DURATION_SECONDS: constants.MINIMUM_CLIP_DURATION_SECONDS
		};
	}

	private isIgnoredNode(node: Element | null): boolean {
		let current: Element | null = node;

		while (current) {
			if (current.id) {
				const id = String(current.id).toLowerCase();
				if (id.startsWith('onetrust') || id === 'ot-sdk-btn') {
					return true;
				}
			}

			const classList = current.classList;
			if (classList && typeof classList.forEach === 'function') {
				let found = false;
				classList.forEach((cls) => {
					if (found || !cls) {
						return;
					}
					const value = String(cls).toLowerCase();
					if (value.includes('onetrust') || value.includes('cookie-preference') || value.includes('cookie_preference')) {
						found = true;
					}
				});
				if (found) {
					return true;
				}
			}

			if (typeof current.getAttribute === 'function') {
				const role = current.getAttribute('role');
				const ariaLabel = current.getAttribute('aria-label') || '';
				if (role && role.toLowerCase() === 'dialog' && ariaLabel.toLowerCase().includes('cookie')) {
					return true;
				}
			}

			if (current.parentElement) {
				current = current.parentElement;
				continue;
			}

			if (typeof current.getRootNode === 'function') {
				const rootNode = current.getRootNode();
				const host = (rootNode as ShadowRoot | null)?.host;
				if (host && host !== current) {
					current = host as Element;
					continue;
				}
			}

			break;
		}

		return false;
	}

	private isWithinUpNext(node: Element | null): boolean {
		const constants = this.getConstants();
		if (!constants) {
			return false;
		}

		const dom = this.getDom();
		if (!dom) {
			return false;
		}

		return dom.isNodeInUpNextSection(node);
	}

	private parseSeasonEpisode(text: string | null | undefined): SeasonEpisodeInfo | null {
		if (!text) {
			return null;
		}

		const normalized = text.replace(/[\u2068\u2069\u202A-\u202E]/g, '').replace(/\s+/g, ' ').trim();
		if (!normalized) {
			return null;
		}

		const seasonEpisodeMatch = normalized.match(/\bS(?:eason)?\s*(\d{1,2})\s*(?:[:E]|Episode)\s*(\d{1,3})/i);
		if (seasonEpisodeMatch) {
			return {
				season: parseInt(seasonEpisodeMatch[1], 10),
				episode: parseInt(seasonEpisodeMatch[2], 10)
			};
		}

		const spelledMatch = normalized.match(/Season\s+(\d{1,2}).*Episode\s+(\d{1,3})/i);
		if (spelledMatch) {
			return {
				season: parseInt(spelledMatch[1], 10),
				episode: parseInt(spelledMatch[2], 10)
			};
		}

		const episodeOnlyMatch = normalized.match(/\bEpisode\s+(\d{1,3})\b/i) || normalized.match(/\bE\s*(\d{1,3})\b/i);
		if (episodeOnlyMatch) {
			return {
				episode: parseInt(episodeOnlyMatch[1], 10)
			};
		}

		return null;
	}

	private collectSeasonEpisodeInfo(): SeasonEpisodeInfo | null {
		const dom = this.getDom();
		const constants = this.getConstants();
		if (!dom || !constants) {
			return null;
		}

		const selectors = [
			'.title-bug-area .subtitle-field span',
			'.title-bug-container .subtitle-field span',
			'[data-testid="playback-details"]',
			'[data-testid="playback-subtitle"]',
			'[data-testid="player-subtitle"]',
			'[data-testid="playback-metadata"]',
			'[class*="SeasonEpisode"]',
			'[class*="seasonEpisode"]',
			'[class*="season-episode"]',
			'.subtitle-field span',
			'.subtitle-field'
		];

		const seen = new Set<string>();

		const evaluateText = (value: string | null | undefined) => {
			if (!value) {
				return null;
			}
			const trimmed = value.trim();
			if (!trimmed || trimmed.length > 200 || seen.has(trimmed)) {
				return null;
			}
			const lowered = trimmed.toLowerCase();
			if (constants.UP_NEXT_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
				return null;
			}
			seen.add(trimmed);
			return this.parseSeasonEpisode(trimmed);
		};

		const parsedFromSelectors = dom.findAcrossAllRoots(selectors, (node) => {
			const element = dom.getElementNode(node);
			if (!element) {
				return null;
			}

			if (!dom.isNodeVisible(element) || dom.isNodeInUpNextSection(element)) {
				return null;
			}

			if (this.isIgnoredNode(element) || dom.shouldSkipTitleNode(element)) {
				return null;
			}

			return evaluateText(element.textContent);
		});

		if (parsedFromSelectors) {
			return parsedFromSelectors;
		}

		const parsedFromAria = dom.findAcrossAllRoots('[aria-label]', (node) => {
			const element = dom.getElementNode(node);
			if (!element || typeof element.getAttribute !== 'function') {
				return null;
			}

			if (!dom.isNodeVisible(element) || dom.isNodeInUpNextSection(element)) {
				return null;
			}

			if (this.isIgnoredNode(element) || dom.shouldSkipTitleNode(element)) {
				return null;
			}

			return evaluateText(element.getAttribute('aria-label'));
		});

		if (parsedFromAria) {
			return parsedFromAria;
		}

		const overlayFallback = this.extractOverlaySeasonEpisodeInfo();
		if (overlayFallback) {
			return overlayFallback;
		}

		return null;
	}

	private extractOverlaySeasonEpisodeInfo(): SeasonEpisodeInfo | null {
		const dom = this.getDom();
		if (!dom) {
			return null;
		}

		const selectors = [
			'.title-bug-container .subtitle-field span',
			'.title-bug-area .subtitle-field span',
			'.subtitle-field span',
			'.subtitle-field',
			'[data-testid="playback-subtitle"]',
			'[data-testid="player-subtitle"]',
			'[data-testid="playback-details"]',
			'[data-testid="playback-metadata"]',
			'[data-testid="playback-subtitle-text"]'
		];

		const seen = new Set<string>();

		return dom.findAcrossAllRoots(selectors, (node) => {
			const element = dom.getElementNode(node);
			if (!element) {
				return null;
			}

			if (this.isIgnoredNode(element) || dom.isNodeInUpNextSection(element)) {
				return null;
			}

			const textContent = element.textContent || '';
			const trimmed = textContent.replace(/\s+/g, ' ').trim();
			if (!trimmed || trimmed.length > 200 || seen.has(trimmed)) {
				return null;
			}

			seen.add(trimmed);
			return this.parseSeasonEpisode(trimmed);
		});
	}

	private determineContentType(info: SeasonEpisodeInfo | null, path: string): 'movie' | 'episode' {
		if (info && (Number.isFinite(info.episode) || Number.isFinite(info.season))) {
			return 'episode';
		}

		if (path && this.isSeriesRoute(path)) {
			return 'episode';
		}

		if (path && this.isMovieRoute(path)) {
			return 'movie';
		}

		return 'movie';
	}

	private playbackRootSelectors(): string[] {
		return [
			'[data-testid="playback-view"]',
			'[data-testid="playback-root"]',
			'[data-testid="dss-player"]',
			'dss-player',
			'dss-video-player',
			'disney-web-player',
			'disney-web-player-ui',
			'#hudson-wrapper',
			'.hudson-container',
			'.btm-media-player',
			'.btm-media-clients',
			'.media-element-container',
			'video[id^="hivePlayer"]'
		];
	}

	private getPlaybackRoot(): Element | null {
		const dom = this.getDom();
		if (!dom) {
			return null;
		}

		const selectors = this.playbackRootSelectors();
		const found = dom.findAcrossAllRoots(selectors, (node) => node as Element);
		return found || null;
	}

	private isWithinPlaybackView(node: Element | null): boolean {
		if (!node || typeof node.closest !== 'function') {
			const playbackRoot = this.getPlaybackRoot();
			return !playbackRoot;
		}

		const selectors = this.playbackRootSelectors();
		const selectorString = selectors.join(', ');

		try {
			const closestMatch = node.closest(selectorString);
			if (closestMatch) {
				return true;
			}
		} catch (error) {
			console.log('[ReWatch][Disney+] Error during closest playback lookup:', (error as Error).message);
		}

		const playbackRoot = this.getPlaybackRoot();
		if (!playbackRoot) {
			return true;
		}

		if (playbackRoot === node) {
			return true;
		}

		if (typeof playbackRoot.contains === 'function') {
			try {
				if (playbackRoot.contains(node)) {
					return true;
				}
			} catch (error) {
				console.log('[ReWatch][Disney+] Error checking playback containment:', (error as Error).message);
			}
		}

		if (typeof node.getRootNode === 'function') {
			const rootNode = node.getRootNode();
			const host = (rootNode as ShadowRoot | null)?.host;
			if (host && typeof (host as Element).matches === 'function') {
				try {
					if (selectors.some((selector) => {
						try {
							return (host as Element).matches(selector);
						} catch (error) {
							console.log('[ReWatch][Disney+] Error evaluating shadow host selector:', (error as Error).message);
							return false;
						}
					})) {
						return true;
					}
				} catch (error) {
					console.log('[ReWatch][Disney+] Error checking shadow host for playback view:', (error as Error).message);
				}
			}
		}

		return false;
	}

	private isSeriesRoute(path: string): boolean {
		if (!path) {
			return false;
		}

		return /(\/series\/|\/season\/|\/seasons\/|\/episode\/|\/episodes\/)/i.test(path);
	}

	private isMovieRoute(path: string): boolean {
		if (!path) {
			return false;
		}

		if (/(\/play\/|\/movie\/|\/movies\/|\/film\/|\/films\/)/i.test(path)) {
			return true;
		}

		if (/\/video\//i.test(path)) {
			return !this.isSeriesRoute(path);
		}

		return false;
	}

	private hasEpisodeMetadata(info: SeasonEpisodeInfo | null): boolean {
		return Boolean(info && (Number.isFinite(info.episode) || Number.isFinite(info.season)));
	}

	private isSeriesVideoCandidate(video: HTMLVideoElement | null): boolean {
		if (!video) {
			return false;
		}

		const dom = this.getDom();
		if (!dom) {
			return false;
		}

		if (!this.isWithinPlaybackView(video) || dom.isNodeInUpNextSection(video)) {
			return false;
		}

		if (!dom.isNodeVisible(video)) {
			return false;
		}

		const haveMetadata = (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.HAVE_METADATA) || 1;
		const readyState = Number.isFinite(video.readyState) ? video.readyState : 0;
		const duration = Number.isFinite(video.duration) ? video.duration : null;

		if (duration !== null && duration > 0 && duration < 120) {
			return false;
		}

		return readyState >= haveMetadata || typeof video.duration === 'number';
	}

	private isMovieVideoCandidate(video: HTMLVideoElement | null): boolean {
		if (!video) {
			return false;
		}

		const dom = this.getDom();
		if (!dom) {
			return false;
		}

		if (!this.isWithinPlaybackView(video) || dom.isNodeInUpNextSection(video)) {
			return false;
		}

		if (!dom.isNodeVisible(video)) {
			return false;
		}

		const haveMetadata = (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.HAVE_METADATA) || 1;
		const readyState = Number.isFinite(video.readyState) ? video.readyState : 0;
		const duration = Number.isFinite(video.duration) ? video.duration : null;

		if (duration !== null && duration > 0 && duration < 120) {
			return false;
		}

		if (readyState >= haveMetadata) {
			return true;
		}

		const rect = video.getBoundingClientRect();
		return rect ? rect.width > 0 && rect.height > 0 : false;
	}

	private isValidSeriesPlayback(videoElements: HTMLVideoElement[] | null, path: string, info: SeasonEpisodeInfo | null, contentType: 'movie' | 'episode' | null): boolean {
		if (!Array.isArray(videoElements) || videoElements.length === 0) {
			return false;
		}

		if (videoElements.some((video) => this.isSeriesVideoCandidate(video))) {
			return true;
		}

		if (contentType === 'episode' || this.isSeriesRoute(path) || this.hasEpisodeMetadata(info)) {
			return true;
		}

		return false;
	}

	private isValidMoviePlayback(videoElements: HTMLVideoElement[] | null, path: string, info: SeasonEpisodeInfo | null, contentType: 'movie' | 'episode' | null): boolean {
		if (!Array.isArray(videoElements) || videoElements.length === 0) {
			return false;
		}

		if (videoElements.some((video) => this.isMovieVideoCandidate(video))) {
			return true;
		}

		if (contentType === 'movie' || this.isMovieRoute(path)) {
			return !this.hasEpisodeMetadata(info);
		}

		return false;
	}
}

const initializeDisneyPlusDetector = () => {
	if (typeof window === 'undefined') {
		return;
	}

	const globalWindow = window as DisneyPlusWindow;
	const root = globalWindow.ReWatch;
	const registry = root?.platformRegistry as PlatformRegistry<PlatformDetector> | undefined;
	if (!registry) {
		return;
	}

	registry.registerDetector((hostname) => new DisneyPlusDetector(hostname));
};

initializeDisneyPlusDetector();

export { DisneyPlusDetector };
