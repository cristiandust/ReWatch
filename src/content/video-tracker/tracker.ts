import { findAllVideoElements } from '../core/dom';
import { getPageTitle, resetCachedTitle } from '../core/title';
import type { PlatformDetector, EpisodeInference } from '../platform-detectors/base';
import type { PlatformRegistry } from '../core/platform-registry';
import type { ReWatchNamespace } from '../core/namespace';

type TrackerConstants = {
	SUPPORTED_PLATFORM_NAMES?: readonly string[];
	MINIMUM_CLIP_DURATION_SECONDS?: number;
};

type DomApi = {
	shouldSkipTitleNode?: (node: Node | null) => boolean;
};

type ParentBroadcast = {
	requestParentContext?: () => void;
};

type RuntimeProgress = {
	currentTime: number;
	percentComplete: number;
};

type RuntimeMessage =
	| {
		action: 'saveProgress';
		data: Record<string, unknown>;
	}
	| {
		action: 'getProgress';
		url: string;
	}
	| {
		action: 'debugLog';
		message: string;
		data?: Record<string, unknown>;
	};

type ChromeRuntime = {
	id?: string;
	sendMessage: (message: RuntimeMessage, responseCallback?: (response: { success: boolean; data?: RuntimeProgress }) => void) => void;
	lastError?: { message?: string } | null;
};

type ChromeWindow = Window & {
	chrome?: {
		runtime?: ChromeRuntime;
	};
};

type TrackerCoreBase = ReWatchNamespace['core'] & {
	dom?: DomApi;
	VideoTracker?: unknown;
};

type TrackerNamespaceBase = ReWatchNamespace & {
	core: TrackerCoreBase;
	platformRegistry?: PlatformRegistry<PlatformDetector>;
	parentBroadcast?: ParentBroadcast;
	tracker?: unknown;
};

type TrackerWindow = Window & {
	ReWatch?: TrackerNamespaceBase;
	ReWatchParentUrl?: string;
	ReWatchParentTitle?: string;
	ReWatchParentEpisode?: number;
	ReWatchParentSeason?: number;
	ReWatchParentSeriesTitle?: string;
	ReWatchParentEpisodeTitle?: string;
	ReWatchParentCanonicalUrl?: string;
	ReWatchParentContentType?: string;
};

type VideoTrackerMetadata = {
	title?: string | null;
	originalTitle?: string | null;
	seriesTitle?: string | null;
	series?: string | null;
	showTitle?: string | null;
	platform?: string | null;
	type?: 'movie' | 'episode' | null;
	url?: string | null;
	episodeNumber?: number | null;
	seasonNumber?: number | null;
	episodeName?: string | null;
	isIframe?: boolean;
	episode?: number | null;
	season?: number | null;
};

type ResumeResponse = {
	success: boolean;
	data?: RuntimeProgress;
};

const getNamespace = (): TrackerNamespaceBase | null => {
	if (typeof window === 'undefined') {
		return null;
	}
	const globalWindow = window as TrackerWindow;
		return globalWindow.ReWatch ?? null;
};

const getConstants = (): TrackerConstants | null => {
	const namespace = getNamespace();
	if (!namespace) {
		return null;
	}
	const constants = namespace.constants as TrackerConstants | undefined;
	return constants ?? null;
};

const getDomApi = (): DomApi | null => {
	const namespace = getNamespace();
	if (!namespace) {
		return null;
	}
	return namespace.core?.dom ?? null;
};

const getChromeRuntime = (): ChromeRuntime | null => {
	if (typeof window === 'undefined') {
		return null;
	}
	const runtime = (window as ChromeWindow).chrome?.runtime;
	return runtime ?? null;
};

const sendDebugLog = (message: string, data?: Record<string, unknown>): void => {
	const runtime = getChromeRuntime();
	if (!runtime || !runtime.id) {
		return;
	}
	try {
		const payload: RuntimeMessage = data
			? { action: 'debugLog', message, data }
			: { action: 'debugLog', message };
		runtime.sendMessage(payload, () => undefined);
	} catch (error) {
		const result = error instanceof Error ? error.message : String(error);
		console.log('[ReWatch] Debug log failed:', result);
	}
};

class VideoTracker {
	private videoElement: HTMLVideoElement | null;
	private progressInterval: number | null;
	private resumeCheckTimeout: number | null;
	private pendingNavigationDetection: number | null;
	private lastSavedTime: number;
	private readonly saveThreshold: number;
	private detectionAttempts: number;
	private readonly maxDetectionAttempts: number;
	private platformDetector: PlatformDetector | null;
	private lastMetadataSignature: string | null;
	private hasPerformedInitialResumeCheck: boolean;
	private lastVideoSrc: string | null;
	private navigationListenersSetup: boolean;
	private lastKnownUrl: string;
	private readonly boundOnPlay: () => void;
	private readonly boundOnPause: () => void;
	private readonly boundOnTimeUpdate: () => void;
	private readonly boundOnEnded: () => void;
	private readonly boundOnLoadedMetadata: () => void;
	private readonly boundOnDurationChange: () => void;
	private readonly boundOnEmptied: () => void;

	constructor() {
		this.videoElement = null;
		this.progressInterval = null;
		this.resumeCheckTimeout = null;
		this.pendingNavigationDetection = null;
		this.lastSavedTime = 0;
		this.saveThreshold = 10;
		this.detectionAttempts = 0;
		this.maxDetectionAttempts = 10;
		this.platformDetector = null;
		this.lastMetadataSignature = null;
		this.hasPerformedInitialResumeCheck = false;
		this.lastVideoSrc = null;
		this.navigationListenersSetup = false;
		this.lastKnownUrl = typeof window !== 'undefined' ? window.location.href : '';
		this.boundOnPlay = () => this.onVideoPlay();
		this.boundOnPause = () => this.onVideoPause();
		this.boundOnTimeUpdate = () => this.onTimeUpdate();
		this.boundOnEnded = () => this.onVideoEnded();
		this.boundOnLoadedMetadata = () => this.handlePlaybackContextUpdate('loadedmetadata');
		this.boundOnDurationChange = () => this.handlePlaybackContextUpdate('durationchange');
		this.boundOnEmptied = () => this.handlePlaybackContextUpdate('emptied');
	}

	init(): void {
		console.log('[ReWatch] Initializing video tracker...');
		this.setupNavigationListeners();
		this.setupMutationObserver();
		this.detectVideo();
		this.requestParentContext();
	}

	get hasVideo(): boolean {
		return Boolean(this.videoElement);
	}

	detectVideo(): void {
		const videos = findAllVideoElements();
		console.log('[ReWatch] Found', videos.length, 'video element(s) (including shadow DOM)');
		const platformDetector = this.getPlatformDetector();
		const platformName = platformDetector?.getPlatformName?.() ?? null;
		let candidateVideos = videos;
		if (platformDetector?.filterVideoElements) {
			try {
				const filtered = platformDetector.filterVideoElements(videos) ?? [];
				if (Array.isArray(filtered) && filtered.length) {
					candidateVideos = filtered;
					if (filtered.length !== videos.length) {
						console.log('[ReWatch] Filtered video candidates for', platformName ?? 'generic detector', ':', filtered.length, '/', videos.length);
					}
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Error filtering video candidates:', message);
			}
		}
		if (!candidateVideos.length) {
			if (this.detectionAttempts < this.maxDetectionAttempts) {
				this.detectionAttempts += 1;
				console.log('[ReWatch] No playable video found yet, retry attempt', this.detectionAttempts, 'in 2 seconds...');
				window.setTimeout(() => this.detectVideo(), 2000);
			} else {
				console.log('[ReWatch] Max detection attempts reached, giving up');
			}
			return;
		}
		let mainVideo: HTMLVideoElement | null = null;
		if (platformDetector?.selectVideoElement) {
			try {
				mainVideo = platformDetector.selectVideoElement(candidateVideos);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Error selecting platform-specific video candidate:', message);
			}
		}
		if (!mainVideo) {
			if (candidateVideos.length === 1) {
				mainVideo = candidateVideos[0] ?? null;
			} else {
				mainVideo = candidateVideos.reduce<HTMLVideoElement | null>((largest, video) => {
					if (!largest) {
						return video;
					}
					try {
						const largestRect = largest.getBoundingClientRect();
						const videoRect = video.getBoundingClientRect();
						const largestArea = Math.max(0, largestRect.width) * Math.max(0, largestRect.height);
						const videoArea = Math.max(0, videoRect.width) * Math.max(0, videoRect.height);
						return videoArea > largestArea ? video : largest;
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						console.log('[ReWatch] Error comparing video candidates:', message);
						return largest;
					}
				}, null);
			}
		}
		if (!mainVideo) {
			if (this.detectionAttempts < this.maxDetectionAttempts) {
				this.detectionAttempts += 1;
				console.log('[ReWatch] Candidate selection returned no video, retry attempt', this.detectionAttempts, 'in 2 seconds...');
				window.setTimeout(() => this.detectVideo(), 2000);
			} else {
				console.log('[ReWatch] Max detection attempts reached, giving up');
			}
			return;
		}
		try {
			const rect = mainVideo.getBoundingClientRect();
			console.log('[ReWatch] Selected video:', mainVideo, 'Size:', Math.round(rect.width), 'x', Math.round(rect.height));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.log('[ReWatch] Selected video but failed to measure size:', message);
		}
		this.attachToVideo(mainVideo);
	}

	private setupNavigationListeners(): void {
		if (this.navigationListenersSetup) {
			return;
		}
		this.navigationListenersSetup = true;
		this.lastKnownUrl = window.location.href;
		const handleUrlChange = (reason: string) => {
			try {
				const currentUrl = window.location.href;
				if (!currentUrl || currentUrl === this.lastKnownUrl) {
					return;
				}
				const previousUrl = this.lastKnownUrl;
				this.lastKnownUrl = currentUrl;
				console.log('[ReWatch] Navigation change detected:', { reason, previousUrl, currentUrl });
				this.handlePlaybackContextUpdate('navigation');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Error handling navigation change:', message);
			}
		};
		try {
			window.addEventListener('popstate', () => handleUrlChange('popstate'));
			window.addEventListener('hashchange', () => handleUrlChange('hashchange'));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.log('[ReWatch] Failed to attach popstate/hashchange listeners:', message);
		}
		const historyObject = window.history as unknown as Record<string, unknown>;
		const wrapHistoryMethod = (methodName: 'pushState' | 'replaceState') => {
			const original = historyObject?.[methodName];
			if (typeof original !== 'function') {
				return;
			}
			try {
				historyObject[methodName] = (...args: unknown[]) => {
					const result = (original as (...innerArgs: unknown[]) => unknown).apply(window.history, args);
					handleUrlChange(methodName);
					return result;
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Failed to wrap history method:', methodName, message);
			}
		};
		try {
			wrapHistoryMethod('pushState');
			wrapHistoryMethod('replaceState');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.log('[ReWatch] Unable to wrap history navigation methods:', message);
		}
	}

	private setupMutationObserver(): void {
		if (!document.body) {
			return;
		}
		const observer = new MutationObserver(() => {
			if (!this.videoElement || !document.contains(this.videoElement)) {
				this.detectVideo();
			}
		});
		observer.observe(document.body, {
			childList: true,
			subtree: true
		});
	}

	private requestParentContext(): void {
		const namespace = getNamespace();
		const parentBroadcast = namespace?.parentBroadcast;
		parentBroadcast?.requestParentContext?.();
	}

	private scheduleResumeCheck(delay = 0): void {
		if (this.resumeCheckTimeout) {
			clearTimeout(this.resumeCheckTimeout);
			this.resumeCheckTimeout = null;
		}
		const normalizedDelay = Number.isFinite(delay) ? Math.max(0, delay) : 0;
		this.hasPerformedInitialResumeCheck = false;
		this.resumeCheckTimeout = window.setTimeout(() => {
			this.resumeCheckTimeout = null;
			if (!this.videoElement) {
				return;
			}
			this.checkSavedProgress();
			this.hasPerformedInitialResumeCheck = true;
		}, normalizedDelay);
	}

	private handlePlaybackContextUpdate(reason: 'navigation' | 'loadedmetadata' | 'durationchange' | 'emptied'): void {
		resetCachedTitle();
		this.platformDetector = null;
		this.lastMetadataSignature = null;
		this.lastVideoSrc = this.videoElement && typeof this.videoElement.currentSrc === 'string' ? this.videoElement.currentSrc : null;
		this.lastSavedTime = 0;
		if (window.self !== window.top) {
			this.requestParentContext();
		}
		if (reason === 'navigation') {
			if (this.pendingNavigationDetection) {
				clearTimeout(this.pendingNavigationDetection);
				this.pendingNavigationDetection = null;
			}
			this.pendingNavigationDetection = window.setTimeout(() => {
				this.pendingNavigationDetection = null;
				this.detectionAttempts = 0;
				this.detectVideo();
			}, 800);
			this.scheduleResumeCheck(1200);
			return;
		}
		if (reason === 'loadedmetadata' || reason === 'durationchange') {
			this.scheduleResumeCheck(700);
		}
	}

	private detachCurrentVideo(): void {
		if (!this.videoElement) {
			return;
		}
		const removeListener = (event: keyof HTMLMediaElementEventMap, handler: () => void) => {
			try {
				this.videoElement?.removeEventListener(event, handler);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Error removing listener for', event, message);
			}
		};
		removeListener('play', this.boundOnPlay);
		removeListener('pause', this.boundOnPause);
		removeListener('timeupdate', this.boundOnTimeUpdate);
		removeListener('ended', this.boundOnEnded);
		removeListener('loadedmetadata', this.boundOnLoadedMetadata);
		removeListener('durationchange', this.boundOnDurationChange);
		removeListener('emptied', this.boundOnEmptied);
		if (this.progressInterval) {
			clearInterval(this.progressInterval);
			this.progressInterval = null;
		}
		if (this.resumeCheckTimeout) {
			clearTimeout(this.resumeCheckTimeout);
			this.resumeCheckTimeout = null;
		}
		this.hasPerformedInitialResumeCheck = false;
		this.videoElement = null;
	}

	private attachToVideo(video: HTMLVideoElement): void {
		if (this.videoElement === video) {
			console.log('[ReWatch] Already attached to this video');
			return;
		}
		this.detachCurrentVideo();
		this.detectionAttempts = 0;
		resetCachedTitle();
		this.videoElement = video;
		this.lastVideoSrc = typeof video.currentSrc === 'string' ? video.currentSrc : null;
		console.log('[ReWatch] Attaching to video element');
		video.addEventListener('play', this.boundOnPlay);
		video.addEventListener('pause', this.boundOnPause);
		video.addEventListener('timeupdate', this.boundOnTimeUpdate);
		video.addEventListener('ended', this.boundOnEnded);
		video.addEventListener('loadedmetadata', this.boundOnLoadedMetadata);
		video.addEventListener('durationchange', this.boundOnDurationChange);
		video.addEventListener('emptied', this.boundOnEmptied);
		const delay = window.self !== window.top ? 500 : 0;
		this.scheduleResumeCheck(delay);
	}

	private extractMetadata(): VideoTrackerMetadata | null {
		const namespaceWindow = window as TrackerWindow;
		const parentUrlFromWindow = namespaceWindow.ReWatchParentUrl;
		const parentCanonicalUrl = typeof namespaceWindow.ReWatchParentCanonicalUrl === 'string' ? namespaceWindow.ReWatchParentCanonicalUrl : null;
		const parentSeriesTitle = typeof namespaceWindow.ReWatchParentSeriesTitle === 'string' ? namespaceWindow.ReWatchParentSeriesTitle : null;
		const parentEpisodeTitle = typeof namespaceWindow.ReWatchParentEpisodeTitle === 'string' ? namespaceWindow.ReWatchParentEpisodeTitle : null;
		const parentContentType = namespaceWindow.ReWatchParentContentType === 'episode' || namespaceWindow.ReWatchParentContentType === 'movie' ? namespaceWindow.ReWatchParentContentType : null;
		const isInIframe = window.self !== window.top;
		let pageUrl = window.location.href;
		if (isInIframe) {
			try {
				pageUrl = window.top?.location.href ?? pageUrl;
				console.log('[ReWatch] In iframe, using parent URL:', pageUrl);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Cross-origin iframe detected:', message);
				if (parentUrlFromWindow) {
					pageUrl = parentUrlFromWindow;
					console.log('[ReWatch] Using cached parent URL:', pageUrl);
				} else if (document.referrer && document.referrer !== `${window.location.origin}/`) {
					pageUrl = document.referrer;
					console.log('[ReWatch] Using referrer:', pageUrl);
				} else {
					console.log('[ReWatch] No parent URL available, using iframe URL');
				}
			}
		}
		const platformDetector = this.getPlatformDetector();
		const platformContentType = platformDetector?.getContentType?.() ?? null;
		let platformName = platformDetector?.getPlatformName?.() ?? null;
		const metadata: VideoTrackerMetadata = {
			title: this.extractTitle(),
			url: pageUrl,
			platform: platformName ?? this.detectPlatform(pageUrl),
			type: platformContentType ?? 'movie',
			isIframe: isInIframe
		};
		if (!metadata.platform && parentUrlFromWindow && parentUrlFromWindow !== metadata.url) {
			platformName = platformName ?? this.detectPlatform(parentUrlFromWindow);
			if (platformName) {
				metadata.platform = platformName;
				metadata.url = parentUrlFromWindow;
			}
		}
		if (metadata.title) {
			metadata.originalTitle = metadata.title;
		}
		const canonicalCandidate = parentCanonicalUrl && parentCanonicalUrl.startsWith('http') ? parentCanonicalUrl : null;
		const contextUrl = canonicalCandidate ?? metadata.url ?? parentUrlFromWindow ?? pageUrl;
		let contextHostname: string | null = null;
		try {
			contextHostname = new URL(contextUrl).hostname.toLowerCase();
		} catch (error) {
			console.log('[ReWatch][Tracker] Failed to parse context URL:', (error as Error).message);
			contextHostname = null;
		}
		const normalizedPlatform = metadata.platform ?? platformName ?? null;
		const isCrunchyrollContext = (normalizedPlatform ? normalizedPlatform.toLowerCase() === 'crunchyroll' : false) || (contextHostname ? contextHostname.includes('crunchyroll') : false);
		let hasAuthoritativeParentEpisodeTitle = false;
		if (isCrunchyrollContext) {
			if (canonicalCandidate && canonicalCandidate !== metadata.url) {
				metadata.url = canonicalCandidate;
			}
			const normalizedSeriesTitle = parentSeriesTitle ? parentSeriesTitle.trim() : '';
			if (normalizedSeriesTitle) {
				if (!metadata.seriesTitle) {
					metadata.seriesTitle = normalizedSeriesTitle;
				}
				if (!metadata.showTitle) {
					metadata.showTitle = normalizedSeriesTitle;
				}
			}
			const normalizedEpisodeTitle = parentEpisodeTitle ? parentEpisodeTitle.trim() : '';
			if (normalizedEpisodeTitle) {
				metadata.episodeName = normalizedEpisodeTitle;
				metadata.originalTitle = normalizedEpisodeTitle;
				if (metadata.type !== 'episode') {
					metadata.type = 'episode';
				}
				hasAuthoritativeParentEpisodeTitle = true;
			}
			if (parentContentType === 'episode' && metadata.type !== 'episode') {
				metadata.type = 'episode';
			}
			if (parentContentType === 'movie' && !metadata.type) {
				metadata.type = 'movie';
			}
			if (!metadata.platform) {
				metadata.platform = 'Crunchyroll';
			}
		}
		const episodeNum = this.extractEpisodeNumber();
		const seasonNum = this.extractSeasonNumber();
		if (episodeNum !== null || seasonNum !== null) {
			metadata.type = 'episode';
			if (typeof episodeNum === 'number' && Number.isFinite(episodeNum)) {
				metadata.episodeNumber = episodeNum;
			}
			if (typeof seasonNum === 'number' && Number.isFinite(seasonNum)) {
				metadata.seasonNumber = seasonNum;
			}
		} else if (platformContentType && metadata.type !== 'episode') {
			metadata.type = platformContentType;
		}
		let inferredFromTitle: EpisodeInference | null = null;
		if (platformDetector && metadata.title) {
			try {
				inferredFromTitle = platformDetector.inferEpisodeInfoFromTitle?.(metadata.title) ?? null;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Error inferring episode info from title:', message);
			}
			if (inferredFromTitle) {
				if (metadata.type !== 'episode') {
					metadata.type = 'episode';
				}
				if (metadata.episodeNumber === undefined && typeof inferredFromTitle.episode === 'number' && Number.isFinite(inferredFromTitle.episode)) {
					metadata.episodeNumber = inferredFromTitle.episode;
				}
				if (metadata.seasonNumber === undefined && typeof inferredFromTitle.season === 'number' && Number.isFinite(inferredFromTitle.season)) {
					metadata.seasonNumber = inferredFromTitle.season;
				}
				if (inferredFromTitle.seriesTitle && !metadata.seriesTitle) {
					metadata.seriesTitle = inferredFromTitle.seriesTitle;
				}
				if (inferredFromTitle.episodeName && !metadata.episodeName) {
					metadata.episodeName = inferredFromTitle.episodeName;
				}
			}
		}
		if (platformDetector) {
			try {
				const episodeName = platformDetector.extractEpisodeName?.();
				const existingEpisodeName = metadata.episodeName;
				const trimmedExistingEpisodeName = existingEpisodeName ? existingEpisodeName.trim() : '';
				if (episodeName && (!hasAuthoritativeParentEpisodeTitle || trimmedExistingEpisodeName.length === 0)) {
					metadata.episodeName = episodeName;
					if (metadata.type !== 'episode') {
						metadata.type = 'episode';
					}
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Error extracting episode name:', message);
			}
		}
		if (
			metadata.platform === 'Netflix' &&
			metadata.type !== 'episode' &&
			platformDetector &&
			typeof (platformDetector as { getCurrentVideoEntry?: () => unknown }).getCurrentVideoEntry === 'function'
		) {
			try {
				const currentEntry = (platformDetector as { getCurrentVideoEntry?: () => { videoEntry?: { summary?: { value?: { episode?: number; season?: number } } } } | null }).getCurrentVideoEntry?.();
				const summary = (currentEntry as { videoEntry?: { summary?: { value?: { episode?: number; season?: number } } } })?.videoEntry?.summary?.value;
				if (summary && (Number.isFinite(summary.episode) || Number.isFinite(summary.season))) {
					metadata.type = 'episode';
					if (metadata.episodeNumber === undefined && typeof summary.episode === 'number' && Number.isFinite(summary.episode)) {
						metadata.episodeNumber = summary.episode;
					}
					if (metadata.seasonNumber === undefined && typeof summary.season === 'number' && Number.isFinite(summary.season)) {
						metadata.seasonNumber = summary.season;
					}
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Error reading Netflix metadata:', message);
			}
		}
		if (platformDetector && metadata.type !== 'episode') {
			try {
				const refreshedType = platformDetector.getContentType?.() ?? null;
				if (refreshedType === 'episode') {
					metadata.type = 'episode';
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Error refreshing content type:', message);
			}
		}
		if (
			metadata.type !== 'episode' &&
			(
				typeof metadata.episodeNumber === 'number' && Number.isFinite(metadata.episodeNumber) ||
				typeof metadata.seasonNumber === 'number' && Number.isFinite(metadata.seasonNumber) ||
				(typeof metadata.episodeName === 'string' && metadata.episodeName.trim().length > 0)
			)
		) {
			metadata.type = 'episode';
		}
		if (metadata.type === 'episode') {
			if (!metadata.seriesTitle) {
				if (metadata.showTitle) {
					metadata.seriesTitle = metadata.showTitle;
				} else if (metadata.series) {
					metadata.seriesTitle = metadata.series;
				}
			}
			if (metadata.seriesTitle && (!metadata.title || metadata.title !== metadata.seriesTitle)) {
				metadata.title = metadata.seriesTitle;
			}
			if (!metadata.originalTitle && metadata.title) {
				metadata.originalTitle = metadata.title;
			}
		}
		console.log('[ReWatch] Extracted metadata:', metadata);
		return metadata;
	}

	private extractTitle(): string | null {
		const namespaceWindow = window as TrackerWindow;
		if (window.self === window.top) {
			const title = getPageTitle();
			console.log('[ReWatch] Using getPageTitle():', title);
			return title;
		}
		if (namespaceWindow.ReWatchParentTitle) {
			console.log('[ReWatch] Using cached parent title:', namespaceWindow.ReWatchParentTitle);
			return namespaceWindow.ReWatchParentTitle;
		}
		const platformDetector = this.getPlatformDetector();
		if (platformDetector) {
			try {
				const platformTitle = platformDetector.extractTitle?.();
				if (platformTitle) {
					return platformTitle;
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Error extracting platform title:', message);
			}
		}
		return this.genericExtractTitle();
	}

	private genericExtractTitle(): string | null {
		const unwantedTitles = [
			'privacy preference center',
			'cookie preferences',
			'sign in',
			'login',
			'register',
			'home',
			'watch',
			'loading',
			'error'
		];
		const selectors = ['h1', '[class*="title"]', '[class*="Title"]', '[data-testid*="title"]', 'meta[property="og:title"]', 'title'];
		const domApi = getDomApi();
		for (const selector of selectors) {
			const element = document.querySelector(selector) as HTMLMetaElement | HTMLElement | null;
			if (!element) {
				continue;
			}
			if (domApi?.shouldSkipTitleNode && domApi.shouldSkipTitleNode(element)) {
				continue;
			}
			const candidate = element instanceof HTMLMetaElement ? element.content : element.textContent ?? '';
			const trimmed = candidate.trim();
			if (!trimmed) {
				continue;
			}
			const lower = trimmed.toLowerCase();
			if (unwantedTitles.some((unwanted) => lower.includes(unwanted))) {
				continue;
			}
			return trimmed;
		}
		return document.title || 'Unknown Title';
	}

	private detectPlatform(url: string | null): string | null {
		const detector = this.getPlatformDetector();
		const platformName = detector?.getPlatformName?.();
		if (platformName) {
			return platformName;
		}
		if (!url) {
			return null;
		}
		try {
			const hostname = new URL(url).hostname.toLowerCase();
			if (hostname.includes('netflix')) {
				return 'Netflix';
			}
			if (hostname.includes('disneyplus')) {
				return 'Disney+';
			}
			if (hostname.includes('brocoflix') || hostname.includes('vidlink')) {
				return 'Brocoflix';
			}
			if (
				hostname.includes('hianime') ||
				hostname.includes('aniwatch') ||
				hostname.includes('mega') && hostname.includes('cloud') ||
				hostname.includes('vizcloud') ||
				hostname.includes('rapidcloud') ||
				hostname.includes('streamwish') ||
				hostname.includes('aniworld')
			) {
				return 'HiAnime';
			}
			if (hostname.includes('hbomax') || hostname.endsWith('max.com') || hostname.includes('.max.com') || hostname.includes('hbo.')) {
				return 'HBO Max';
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.log('[ReWatch] Unable to parse URL for platform detection:', message);
		}
		return null;
	}

	private extractEpisodeNumber(): number | null {
		const namespaceWindow = window as TrackerWindow;
		const platformDetector = this.getPlatformDetector();
		const contentType = platformDetector?.getContentType?.() ?? null;
		if (contentType === 'movie') {
			return null;
		}
		if (window.self !== window.top && namespaceWindow.ReWatchParentEpisode !== undefined) {
			console.log('[ReWatch] Using cached parent episode number:', namespaceWindow.ReWatchParentEpisode);
			return namespaceWindow.ReWatchParentEpisode;
		}
		if (platformDetector) {
			try {
				const episodeNum = platformDetector.extractEpisodeNumber?.();
				if (episodeNum !== null && episodeNum !== undefined) {
					return episodeNum;
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Error extracting platform episode number:', message);
			}
		}
		return this.genericExtractEpisodeNumber();
	}

	private genericExtractEpisodeNumber(): number | null {
		const namespaceWindow = window as TrackerWindow;
		let parentUrl: URL | null = null;
		if (window.self !== window.top && namespaceWindow.ReWatchParentUrl) {
			try {
				parentUrl = new URL(namespaceWindow.ReWatchParentUrl);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Could not parse parent URL:', message);
			}
		}
		const sources: Array<() => string | null> = [
			() => {
				const activeEp = document.querySelector('.ep-item.active, .episode-item.active, [class*="episode"].active');
				const text = activeEp?.textContent ?? '';
				const match = text.match(/(\d+)/);
				return match ? match[1] ?? null : null;
			},
			() => {
				const reference = parentUrl ?? window.location;
				const patterns = [/episode[_-]?(\d+)/i, /ep[_-]?(\d+)/i];
				for (const pattern of patterns) {
					const match = reference.pathname.match(pattern);
					if (match) {
						return match[1] ?? null;
					}
				}
				return null;
			}
		];
		for (const source of sources) {
			const result = source();
			if (result) {
				const parsed = parseInt(result, 10);
				if (Number.isFinite(parsed)) {
					return parsed;
				}
			}
		}
		console.log('[ReWatch] Could not detect episode number');
		return null;
	}

	private extractSeasonNumber(): number | null {
		const namespaceWindow = window as TrackerWindow;
		const platformDetector = this.getPlatformDetector();
		const contentType = platformDetector?.getContentType?.() ?? null;
		if (contentType === 'movie') {
			return null;
		}
		if (window.self !== window.top && namespaceWindow.ReWatchParentSeason !== undefined) {
			console.log('[ReWatch] Using cached parent season number:', namespaceWindow.ReWatchParentSeason);
			return namespaceWindow.ReWatchParentSeason;
		}
		if (platformDetector) {
			try {
				const seasonNum = platformDetector.extractSeasonNumber?.();
				if (seasonNum !== null && seasonNum !== undefined) {
					return seasonNum;
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch] Error extracting platform season number:', message);
			}
		}
		return this.genericExtractSeasonNumber();
	}

	private genericExtractSeasonNumber(): number | null {
		const sources: Array<() => string | null> = [
			() => {
				const patterns = [/season[_-]?(\d+)/i, /s(\d+)e\d+/i];
				for (const pattern of patterns) {
					const match = window.location.pathname.match(pattern);
					if (match && parseInt(match[1] ?? '', 10) > 0) {
						return match[1] ?? null;
					}
				}
				return null;
			},
			() => {
				const title = this.extractTitle() ?? '';
				const patterns = [/Season\s+(\d+)/i, /Series\s+(\d+)/i];
				for (const pattern of patterns) {
					const match = title.match(pattern);
					if (match && parseInt(match[1] ?? '', 10) > 0) {
						return match[1] ?? null;
					}
				}
				return null;
			}
		];
		for (const source of sources) {
			const result = source();
			if (result) {
				const parsed = parseInt(result, 10);
				if (Number.isFinite(parsed)) {
					return parsed;
				}
			}
		}
		console.log('[ReWatch] Could not detect season number');
		return null;
	}

	private onVideoPlay(): void {
		console.log('[ReWatch] Video playing');
		this.progressInterval = window.setInterval(() => {
			this.saveProgress();
		}, 5000);
	}

	private onVideoPause(): void {
		console.log('[ReWatch] Video paused');
		if (this.progressInterval) {
			clearInterval(this.progressInterval);
			this.progressInterval = null;
		}
		this.saveProgress();
	}

	private onTimeUpdate(): void {
		if (!this.videoElement) {
			return;
		}
		const currentTime = this.videoElement.currentTime;
		if (Math.abs(currentTime - this.lastSavedTime) >= this.saveThreshold) {
			this.saveProgress();
		}
	}

	private onVideoEnded(): void {
		console.log('[ReWatch] Video ended');
		this.saveProgress(true);
	}

	private saveProgress(completed = false): void {
		if (!this.videoElement) {
			console.log('[ReWatch] Cannot save progress - no video element');
			sendDebugLog('saveProgress_skipped_no_video');
			return;
		}
		const currentTime = this.videoElement.currentTime;
		const duration = this.videoElement.duration;
		const currentSrc = typeof this.videoElement.currentSrc === 'string' ? this.videoElement.currentSrc : null;
		if (currentSrc && this.lastVideoSrc !== currentSrc) {
			console.log('[ReWatch] Video source updated:', { previous: this.lastVideoSrc, current: currentSrc });
			this.lastVideoSrc = currentSrc;
			this.lastMetadataSignature = null;
		}
		console.log('[ReWatch] Attempting to save progress:', { currentTime, duration, completed });
		if (currentTime < 1 || duration < 1) {
			console.log('[ReWatch] Skipping save - insufficient progress or duration');
			return;
		}
		const constants = getConstants();
		const platformDetector = this.getPlatformDetector();
		const detectedPlatform = platformDetector?.getPlatformName?.() ?? null;
		const metadata = this.extractMetadata();
		if (!metadata) {
			console.log('[ReWatch] Skipping save - metadata unavailable');
			sendDebugLog('saveProgress_skipped_no_metadata');
			return;
		}
		const effectivePlatform = metadata.platform || detectedPlatform;
		if (effectivePlatform && metadata.platform !== effectivePlatform) {
			metadata.platform = effectivePlatform;
		}
		const enforcePlatformRestrictions = effectivePlatform !== 'Disney+';
		if (enforcePlatformRestrictions) {
			if (typeof constants?.MINIMUM_CLIP_DURATION_SECONDS === 'number' && Number.isFinite(duration) && duration < constants.MINIMUM_CLIP_DURATION_SECONDS) {
				console.log('[ReWatch] Skipping save - duration below minimum threshold');
				sendDebugLog('saveProgress_skipped_short_clip', { duration, minDuration: constants.MINIMUM_CLIP_DURATION_SECONDS });
				return;
			}
			if (platformDetector?.isValidPlaybackPage && !platformDetector.isValidPlaybackPage(metadata)) {
				console.log('[ReWatch] Not a valid playback page - skipping save');
				sendDebugLog('saveProgress_skipped_invalid_page', { platform: effectivePlatform ?? null });
				return;
			}
		}
		if (!effectivePlatform || !constants?.SUPPORTED_PLATFORM_NAMES || !constants.SUPPORTED_PLATFORM_NAMES.includes(effectivePlatform)) {
			console.log('[ReWatch] Skipping unsupported platform:', effectivePlatform ?? 'Unknown');
			sendDebugLog('saveProgress_skipped_unsupported_platform', { platform: effectivePlatform ?? null });
			return;
		}
		if (effectivePlatform === 'Disney+') {
			let metadataPath = '';
			let metadataUrl: URL | null = null;
			try {
				metadataUrl = new URL(metadata.url ?? window.location.href);
				metadataPath = metadataUrl.pathname || '';
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log('[ReWatch][Disney+] Could not parse metadata URL:', message);
			}
			const isPlaybackRoute = metadataPath ? /(\/video\/|\/play\/|\/movie\/|\/movies\/|\/series\/|\/season\/|\/episode\/)/i.test(metadataPath) : false;
			const hasPlaybackParam = metadataUrl ? metadataUrl.searchParams.has('play') : false;
			const detectorConfirmsPlayback = typeof platformDetector?.isValidPlaybackPage === 'function' ? platformDetector.isValidPlaybackPage() : false;
			if (!isPlaybackRoute && !hasPlaybackParam && !detectorConfirmsPlayback) {
				console.log('[ReWatch][Disney+] Skipping save - non-playback route detected:', metadataPath);
				return;
			}
		}
		if (metadata.type && metadata.type !== 'movie' && metadata.type !== 'episode') {
			console.log('[ReWatch] Skipping unsupported content type:', metadata.type);
			return;
		}
		if (metadata.platform === 'Netflix' && metadata.title && metadata.title.trim().toLowerCase() === 'general description') {
			console.log('[ReWatch] Skipping Netflix general description preview');
			return;
		}
		const metadataSignature = this.createMetadataSignature(metadata);
		if (metadataSignature && metadataSignature !== this.lastMetadataSignature) {
			const previousSignature = this.lastMetadataSignature;
			this.lastMetadataSignature = metadataSignature;
			if (previousSignature !== null) {
				console.log('[ReWatch] Playback metadata changed:', { previousSignature, metadataSignature });
				this.scheduleResumeCheck(800);
			}
		}
		const progressData = {
			...metadata,
			currentTime: completed ? duration : currentTime,
			duration
		};
		console.log('[ReWatch] Saving progress data:', progressData);
		sendDebugLog('saveProgress_attempt', {
			platform: effectivePlatform ?? null,
			completed,
			currentTime,
			duration,
			url: metadata.url ?? null,
			metadataType: metadata.type ?? null
		});
		const chromeRuntime = getChromeRuntime();
		if (!chromeRuntime || !chromeRuntime.id) {
			console.log('[ReWatch] Extension context invalidated - skipping save');
			sendDebugLog('saveProgress_skipped_missing_runtime');
			return;
		}
		try {
			chromeRuntime.sendMessage({ action: 'saveProgress', data: progressData }, (response) => {
				if (chromeRuntime.lastError) {
					const message = chromeRuntime.lastError.message ?? '';
					if (message.includes('Extension context invalidated')) {
						console.log('[ReWatch] Extension was reloaded - stopping tracker');
						if (this.progressInterval) {
							clearInterval(this.progressInterval);
							this.progressInterval = null;
						}
						return;
					}
					console.log('[ReWatch] Error sending message:', message);
					return;
				}
				if (response && response.success) {
					this.lastSavedTime = currentTime;
					console.log('[ReWatch] Progress saved successfully');
				} else {
					console.log('[ReWatch] Failed to save progress:', response);
				}
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.log('[ReWatch] Error saving progress:', message);
		}
	}

	private createMetadataSignature(metadata: VideoTrackerMetadata | null): string | null {
		if (!metadata) {
			return null;
		}
		const safeString = (value: unknown): string => {
			if (value === null || value === undefined) {
				return '';
			}
			if (typeof value === 'number') {
				return String(value);
			}
			return String(value).trim();
		};
		const parts = [
			safeString(metadata.platform).toLowerCase(),
			safeString(metadata.type).toLowerCase(),
			safeString(metadata.seriesTitle).toLowerCase(),
			safeString(metadata.title).toLowerCase(),
			safeString(metadata.episodeName).toLowerCase(),
			typeof metadata.seasonNumber === 'number' && Number.isFinite(metadata.seasonNumber) ? `s${metadata.seasonNumber}` : '',
			typeof metadata.episodeNumber === 'number' && Number.isFinite(metadata.episodeNumber) ? `e${metadata.episodeNumber}` : '',
			safeString(metadata.url).split('?')[0]?.toLowerCase() ?? ''
		];
		return parts.join('|');
	}

	private getResumeLookupUrl(): string | null {
		if (typeof window === 'undefined') {
			return null;
		}
		const namespaceWindow = window as TrackerWindow;
		const parentUrl = namespaceWindow.ReWatchParentUrl;
		if (parentUrl && typeof parentUrl === 'string' && parentUrl.startsWith('http')) {
			return parentUrl;
		}
		if (document.referrer && document.referrer.startsWith('http') && document.referrer !== `${window.location.origin}/`) {
			return document.referrer;
		}
		return window.location.href;
	}

	private checkSavedProgress(): void {
		if (!this.videoElement) {
			return;
		}
		const chromeRuntime = getChromeRuntime();
		if (!chromeRuntime || !chromeRuntime.id) {
			console.log('[ReWatch] Extension context invalidated - skipping resume check');
			return;
		}
		try {
			const resumeUrl = this.getResumeLookupUrl();
			if (!resumeUrl) {
				return;
			}
			chromeRuntime.sendMessage({ action: 'getProgress', url: resumeUrl }, (response: ResumeResponse) => {
				if (chromeRuntime.lastError) {
					const message = chromeRuntime.lastError.message ?? '';
					console.log('[ReWatch] Could not check saved progress:', message);
					return;
				}
				if (response && response.success && response.data) {
					const { currentTime, percentComplete } = response.data;
					if (currentTime > 30 && percentComplete < 95) {
						this.promptResume(currentTime);
					}
				}
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.log('[ReWatch] Error checking saved progress:', message);
		}
	}

	private promptResume(savedTime: number): void {
		if (!document.body) {
			return;
		}
		void savedTime;
	}

	private checkDetectors(hostname: string, registry: PlatformRegistry<PlatformDetector>): PlatformDetector | null {
		try {
			const detectors = registry.createDetectors(hostname);
			for (const detector of detectors) {
				if (!detector) {
					continue;
				}
				try {
					if (typeof detector.canDetect === 'function' && detector.canDetect()) {
						return detector;
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					console.log('[ReWatch] Detector error:', message);
				}
			}
			return null;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.log('[ReWatch] Failed to create platform detectors:', message);
			return null;
		}
	}

	private getPlatformDetector(): PlatformDetector | null {
		if (this.platformDetector) {
			return this.platformDetector;
		}
		const namespace = getNamespace();
		const registry = namespace?.platformRegistry;
		if (!registry) {
			return null;
		}
		const hostname = window.location.hostname;
		const detector = this.checkDetectors(hostname, registry);
		this.platformDetector = detector;
		return detector;
	}
}

type TrackerNamespace = TrackerNamespaceBase & {
	core: TrackerCoreBase & {
		VideoTracker?: typeof VideoTracker;
	};
	tracker?: VideoTracker | null;
};

let globalTracker: VideoTracker | null = null;

const ensureNamespace = (): TrackerNamespace | null => {
	const namespace = getNamespace();
	if (!namespace) {
		return null;
	}
	return namespace as TrackerNamespace;
};

const initializeTracker = () => {
	const namespace = ensureNamespace();
	if (!namespace) {
		console.log('[ReWatch] Namespace unavailable, cannot initialize tracker');
		return;
	}
	if (!globalTracker) {
		globalTracker = new VideoTracker();
		namespace.core.VideoTracker = VideoTracker;
		namespace.tracker = globalTracker;
		globalTracker.init();
	} else if (!namespace.tracker) {
		namespace.tracker = globalTracker;
	}
};

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeTracker, { once: true });
} else {
	initializeTracker();
}

window.addEventListener('load', () => {
	const namespace = ensureNamespace();
	if (!namespace) {
		return;
	}
	if (!globalTracker) {
		initializeTracker();
		return;
	}
	if (!globalTracker.hasVideo) {
		console.log('[ReWatch] Tracker exists but no video, retrying detection...');
		globalTracker.detectVideo();
	}
});

export { VideoTracker };
