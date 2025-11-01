import type { ReWatchNamespace } from './namespace';

type TitleDomApi = {
	shouldSkipTitleNode: (node: Node | null) => boolean;
};

type ReWatchWindow = typeof window & {
	ReWatch?: ReWatchNamespace;
};

let cachedTitle: string | null = null;
let titleObserver: MutationObserver | null = null;

const unwantedTitles = [
	'privacy preference center',
	'cookie preferences',
	'sign in',
	'login',
	'register',
	'home',
	'watch',
	'loading',
	'error',
	'netflix',
	'hbo max',
	'hbo',
	'max',
	'prime video',
	'disney+',
	'hulu'
];

const getRootContext = () => {
	if (typeof window === 'undefined') {
		return null;
	}
	const globalWindow = window as ReWatchWindow;
	const root = globalWindow.ReWatch;
	if (!root) {
		return null;
	}
	const dom = root.core.dom as TitleDomApi | undefined;
	if (!dom || typeof dom.shouldSkipTitleNode !== 'function') {
		return null;
	}
	return { root, dom };
};

const setCachedTitle = (value: string | null) => {
	cachedTitle = value;
};

const resetCachedTitle = () => {
	cachedTitle = null;
};

const getCachedTitle = () => cachedTitle;

const cleanTitle = (title: string): string => {
	return title
		.trim()
		.replace(/[\u2068\u2069\u202A-\u202E]/g, '')
		.replace(/\s+/g, ' ')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/([a-zA-Z])([0-9])/g, '$1 $2')
		.replace(/([0-9])([A-Z])/g, '$1 $2')
		.replace(/\s+/g, ' ')
		.replace(/\s*[•\-|:]\s*(HBO\s*Max?|Max|Netflix|Prime\s*Video|Disney\+?|Hulu).*$/i, '')
		.replace(/^Watch\s+/i, '')
		.replace(/^Now\s+Playing:?\s*/i, '')
		.replace(/\s*[-|]\s*Official\s+(Site|Website)/i, '')
		.replace(/\s+English\s+(Sub|Dub|Subtitles?|Audio).*$/i, '')
		.replace(/\s+\((Sub|Dub|Subtitles?)\)$/i, '')
		.replace(/\s*[-|]\s*Stream(ing)?\s+(Now|Online|Free)?$/i, '')
		.replace(/\s*[-|]\s*Full\s+(Episode|Movie|HD).*$/i, '')
		.trim();
};

const isGenericDisneyTitle = (title: string): boolean => {
	const normalized = title.toLowerCase();
	return normalized.startsWith('disney+') && (
		normalized === 'disney+' ||
		/disney\+\s*[|•-]\s*(movies?\s+and\s+shows|home|watch|official|originals?|series|tv\s+shows)/i.test(title)
	);
};

const isControlLabel = (title: string): boolean => {
	const normalized = title.toLowerCase();
	return (
		normalized === 'audio' ||
		normalized === 'audio and subtitles' ||
		normalized === 'audio & subtitles' ||
		normalized === 'subtitles' ||
		normalized === 'settings'
	);
};

const findHboTitle = (): string | null => {
	const playerTitle = document.querySelector('[data-testid="player-ux-asset-title"]');
	if (playerTitle && playerTitle.textContent && playerTitle.textContent.trim()) {
		const showName = playerTitle.textContent.trim();
		console.log('[ReWatch] Found HBO Max show name from player UI:', showName);
		return showName;
	}

	const selectors = [
		'[class*="Title-Fuse"]',
		'[class*="player"] h1:not(:has(*))',
		'[class*="ContentMetadata"] span:first-child',
		'[class*="PlayerMetadata"] > div:first-child'
	];

	for (const selector of selectors) {
		const element = document.querySelector(selector);
		if (!element || !element.textContent) {
			continue;
		}
		const text = element.textContent.trim();
		if (text && !text.match(/S\s*\d+\s*E\s*\d+/i) && text.length > 2 && text.length < 100) {
			console.log('[ReWatch] Found HBO Max show name:', text);
			return text;
		}
	}

	return null;
};

const trySelectors = (dom: TitleDomApi): string | null => {
	const selectors = [
		'meta[property="og:title"]',
		'meta[name="title"]',
		'meta[property="twitter:title"]',
		'[class*="Metadata"] [class*="Title"]',
		'[class*="metadata"] h1',
		'[class*="VideoMetadata"] h1',
		'[class*="PlayerMetadata"]',
		'button[class*="Title"]',
		'[class*="show-title"]',
		'[class*="series-title"]',
		'[class*="SeriesTitle"]',
		'[class*="ShowTitle"]',
		'[data-testid*="series"]',
		'[data-testid*="show"]',
		'[class*="breadcrumb"] a',
		'[class*="Breadcrumb"] a',
		'a[href*="/series/"]',
		'a[href*="/view/"]',
		'[class*="series"] h1',
		'[class*="series"] h2',
		'[data-uia*="title"]',
		'[data-testid*="title"]',
		'[aria-label*="title"]',
		'[class*="video-title"]',
		'[class*="player-title"]',
		'[class*="VideoTitle"]',
		'[class*="PlayerTitle"]',
		'[class*="film-name"]',
		'[class*="movie-title"]',
		'[class*="anime-title"]',
		'[class*="content-title"]',
		'[class*="media-title"]',
		'h1[class*="title"]:not([class*="episode"])',
		'h2[class*="title"]:not([class*="episode"])',
		'h1[class*="Title"]:not([class*="Episode"])',
		'h2[class*="Title"]:not([class*="Episode"])',
		'.title:not(.episode-title)',
		'.Title:not(.EpisodeTitle)',
		'h1:not([class*="episode"])',
		'h2:not([class*="episode"])',
		'[class*="title"]',
		'[class*="Title"]',
		'[id*="title"]',
		'[id*="Title"]',
		'title'
	];

	for (const selector of selectors) {
		const element = document.querySelector(selector) as (HTMLMetaElement | HTMLElement | null);
		if (!element) {
			continue;
		}

		if (dom.shouldSkipTitleNode(element)) {
			continue;
		}

		const candidate = (element as HTMLMetaElement).content ?? element.textContent ?? '';
		const trimmed = candidate.trim();
		if (!trimmed || trimmed.length >= 200) {
			continue;
		}

		const lower = trimmed.toLowerCase();
		if (unwantedTitles.some((unwanted) => lower === unwanted || (lower.includes(unwanted) && trimmed.length < 15))) {
			console.log('[ReWatch] Skipping generic title:', trimmed);
			continue;
		}

		const cleaned = cleanTitle(trimmed);
		const normalizedCleanTitle = cleaned.toLowerCase();
		const containsCookieBanner = normalizedCleanTitle.includes('cookie preference center')
			|| normalizedCleanTitle.includes('cookie preferences')
			|| normalizedCleanTitle.includes('privacy preference center');

		if (containsCookieBanner) {
			console.log('[ReWatch] Skipping cookie banner title:', cleaned);
			continue;
		}

		if (isGenericDisneyTitle(cleaned)) {
			console.log('[ReWatch] Skipping generic Disney+ title:', cleaned);
			continue;
		}

		if (isControlLabel(cleaned)) {
			console.log('[ReWatch] Skipping control label title:', cleaned);
			continue;
		}

		console.log('[ReWatch] Found title:', cleaned, 'from selector:', selector);
		cachedTitle = cleaned;
		return cleaned;
	}

	return null;
};

const refineFallback = (fallback: string): string => {
	let value = fallback;
	const bulletMatch = value.match(/[•|]\s*([^•|\-]+)/);
	if (bulletMatch && bulletMatch[1].trim().length > 2) {
		value = bulletMatch[1].trim();
		value = value.replace(/\s*[-|•]\s*(HBO\s*Max?|Max|Netflix|Prime|Hulu|Disney\+?)$/i, '').trim();
		console.log('[ReWatch] Extracted show name after bullet/pipe:', value);
		return value;
	}

	const episodeMatch = value.match(/:\s*S\d+\s*E\d+/i);
	if (episodeMatch) {
		const showMatch = value.match(/^([^:]+):/);
		if (showMatch) {
			value = showMatch[1].trim();
			console.log('[ReWatch] Extracted show name before S#E#:', value);
			return value;
		}
	}

	const dashMatch = value.match(/^([^-]+)\s*-\s*[^-]+$/);
	if (dashMatch && !dashMatch[1].match(/HBO|Max|Netflix|Prime|Hulu/i)) {
		value = dashMatch[1].trim();
		console.log('[ReWatch] Extracted show name before dash:', value);
		return value;
	}

	return value;
};

const getFallbackTitle = (): string => {
	let fallback = document.title || '';
	console.log('[ReWatch] Raw document.title:', fallback);

	fallback = refineFallback(fallback);

	if (!fallback || fallback.toLowerCase() === 'netflix' || fallback.toLowerCase() === 'hbo max' || fallback.toLowerCase() === 'max' || fallback.trim().length < 2) {
		console.log('[ReWatch] Document title is generic, trying alternative methods');
		const headings = document.querySelectorAll('h1, h2, h3, strong, b, a[href*="/series/"]');
		for (const heading of headings) {
			const text = heading.textContent ? heading.textContent.trim() : '';
			if (text.length > 3 && text.length < 100 && !unwantedTitles.some((unwanted) => text.toLowerCase() === unwanted)) {
				console.log('[ReWatch] Found alternative title from heading:', text);
				cachedTitle = text;
				return text;
			}
		}
		return fallback && (fallback.includes('max') || fallback.includes('hbo')) ? 'HBO Max Content' : 'Netflix Content';
	}

	fallback = fallback
		.replace(/\s*[-|]\s*(HBO\s*Max?|Max|HiAnime|Netflix|Watch\s+on\s+Netflix|Prime\s+Video|Disney\+)$/i, '')
		.replace(/^Watch\s+/i, '');

	const fallbackLower = fallback.toLowerCase();
	if (unwantedTitles.some((unwanted) => fallbackLower === unwanted)) {
		console.log('[ReWatch] Fallback title is generic:', fallback);
		return 'Netflix Content';
	}

	console.log('[ReWatch] Using fallback title:', fallback);
	cachedTitle = fallback;
	return fallback || 'Unknown Title';
};

const getPageTitle = (): string => {
	if (cachedTitle) {
		console.log('[ReWatch] Using cached title:', cachedTitle);
		return cachedTitle;
	}

	const context = getRootContext();
	if (!context) {
		return document.title || 'Unknown Title';
	}

	const { dom } = context;

	if (window.location.hostname.includes('hbo') || window.location.hostname.includes('max')) {
		const hboTitle = findHboTitle();
		if (hboTitle) {
			cachedTitle = hboTitle;
			return hboTitle;
		}
	}

	const selectorTitle = trySelectors(dom);
	if (selectorTitle) {
		return selectorTitle;
	}

	return getFallbackTitle();
};

const getTitleObserver = () => titleObserver;

const setTitleObserver = (observer: MutationObserver | null) => {
	titleObserver = observer;
};

const initializeTitleModule = () => {
	const context = getRootContext();
	if (!context) {
		return;
	}
	context.root.core.title = Object.freeze({
		getPageTitle,
		getCachedTitle,
		setCachedTitle,
		resetCachedTitle,
		getTitleObserver,
		setTitleObserver
	});
};

initializeTitleModule();

export {
	getCachedTitle,
	getPageTitle,
	getTitleObserver,
	resetCachedTitle,
	setCachedTitle,
	setTitleObserver
};
