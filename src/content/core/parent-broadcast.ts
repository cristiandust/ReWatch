import type { ReWatchNamespace } from './namespace';
import type { ParentInfoMessage } from './iframe-proxy';

type TitleModuleApi = {
	getPageTitle: () => string;
	getCachedTitle: () => string | null;
	resetCachedTitle: () => void;
	getTitleObserver: () => MutationObserver | null;
	setTitleObserver: (observer: MutationObserver | null) => void;
};

type ReWatchWindow = typeof window & {
	ReWatch?: ReWatchNamespace & {
		core: {
			title?: TitleModuleApi;
		};
	};
};

type CrunchyrollStructuredInfo = {
	seriesTitle?: string;
	episodeTitle?: string;
	canonicalUrl?: string;
	episodeNumber?: number;
	seasonNumber?: number;
	contentType?: 'episode' | 'movie';
};

const startTitleObserver = (titleModule: TitleModuleApi) => {
	if (titleModule.getTitleObserver()) {
		return;
	}

	const observer = new MutationObserver(() => {
		const previous = titleModule.getCachedTitle();
		titleModule.resetCachedTitle();
		const updated = titleModule.getPageTitle();

		if (updated !== previous && updated !== 'Netflix Content' && updated !== 'Unknown Title') {
			console.log('[ReWatch Parent] Title updated:', updated);
		}
	});

	if (document.body) {
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true
		});
		titleModule.setTitleObserver(observer);
		console.log('[ReWatch Parent] Title observer started');
	}
};

const scheduleInitialTitleRefresh = (titleModule: TitleModuleApi) => {
	setTimeout(() => {
		titleModule.resetCachedTitle();
		titleModule.getPageTitle();
	}, 2000);
};

const ensurePositiveInteger = (value: unknown): number | null => {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
		return Math.floor(value);
	}
	if (typeof value === 'string') {
		const parsed = parseInt(value, 10);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}
	}
	return null;
};

const getCanonicalLinkHref = (): string | null => {
	const element = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
	if (!element || typeof element.href !== 'string') {
		return null;
	}
	const trimmed = element.href.trim();
	if (!trimmed.startsWith('http')) {
		return null;
	}
	return trimmed;
};

const getStringValue = (value: unknown): string | null => {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}
	return null;
};

const getNameFromValue = (value: unknown): string | null => {
	if (!value) {
		return null;
	}
	if (typeof value === 'string') {
		return getStringValue(value);
	}
	if (Array.isArray(value)) {
		for (const entry of value) {
			const result = getNameFromValue(entry);
			if (result) {
				return result;
			}
		}
		return null;
	}
	if (typeof value === 'object') {
		const named = value as { name?: unknown };
		return getStringValue(named.name);
	}
	return null;
};

const getSeasonNumberFromValue = (value: unknown): number | null => {
	if (!value) {
		return null;
	}
	if (Array.isArray(value)) {
		for (const entry of value) {
			const result = getSeasonNumberFromValue(entry);
			if (result !== null) {
				return result;
			}
		}
		return null;
	}
	if (typeof value === 'object') {
		const seasonCandidate = value as { seasonNumber?: unknown };
		return ensurePositiveInteger(seasonCandidate.seasonNumber ?? null);
	}
	return null;
};

const gatherStructuredNodes = (input: unknown, nodes: Array<Record<string, unknown>>) => {
	if (!input) {
		return;
	}
	if (Array.isArray(input)) {
		for (const entry of input) {
			gatherStructuredNodes(entry, nodes);
		}
		return;
	}
	if (typeof input === 'object') {
		const obj = input as Record<string, unknown>;
		nodes.push(obj);
		if (Object.prototype.hasOwnProperty.call(obj, '@graph')) {
			gatherStructuredNodes(obj['@graph'], nodes);
		}
	}
};

const parseCrunchyrollStructuredData = (): CrunchyrollStructuredInfo | null => {
	const hostname = window.location.hostname.toLowerCase();
	if (!hostname.includes('crunchyroll')) {
		return null;
	}
	const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
	const nodes: Array<Record<string, unknown>> = [];
	for (const script of scripts) {
		const content = script.textContent;
		if (!content) {
			continue;
		}
		try {
			const parsed = JSON.parse(content);
			gatherStructuredNodes(parsed, nodes);
		} catch (error) {
			console.log('[ReWatch][ParentBroadcast] Structured data parsing failed:', (error as Error).message);
			continue;
		}
	}
	const canonicalHref = getCanonicalLinkHref();
	for (const node of nodes) {
		const typeValue = node['@type'];
		const typeList: string[] = [];
		if (typeof typeValue === 'string') {
			typeList.push(typeValue);
		} else if (Array.isArray(typeValue)) {
			for (const entry of typeValue) {
				if (typeof entry === 'string') {
					typeList.push(entry);
				}
			}
		}
		if (!typeList.some((entry) => entry.toLowerCase() === 'tvepisode')) {
			continue;
		}
		const episodeTitle = getNameFromValue(node.name);
		const seriesTitle = getNameFromValue(node.partOfSeries ?? null) ?? getNameFromValue(node.partOfSeason ?? null);
		const episodeNumber = ensurePositiveInteger((node as { episodeNumber?: unknown }).episodeNumber ?? null);
		const seasonNumber = getSeasonNumberFromValue(node.partOfSeason ?? null);
		const urlValue = getStringValue((node as { url?: unknown }).url ?? null) ?? getStringValue((node as { '@id'?: unknown })['@id'] ?? null);
		const canonicalUrl = urlValue ?? canonicalHref ?? null;
		return {
			seriesTitle: seriesTitle ?? undefined,
			episodeTitle: episodeTitle ?? undefined,
			canonicalUrl: canonicalUrl ?? undefined,
			episodeNumber: episodeNumber ?? undefined,
			seasonNumber: seasonNumber ?? undefined,
			contentType: 'episode'
		};
	}
	if (canonicalHref) {
		return {
			canonicalUrl: canonicalHref
		};
	}
	return null;
};

const extractEpisodeFromHbo = (): number | null => {
	const seasonEpisodeEl = document.querySelector('[data-testid="player-ux-season-episode"]');
	if (seasonEpisodeEl && seasonEpisodeEl.textContent) {
		const text = seasonEpisodeEl.textContent.trim();
		const match = text.match(/S\s*\d+\s*E\s*(\d+)/i);
		if (match) {
			console.log('[ReWatch Parent] Found HBO Max episode from dedicated element:', match[1]);
			return parseInt(match[1], 10);
		}
	}
	console.log('[ReWatch Parent] HBO Max: No season-episode element found, not a series');
	return null;
};

const detectEpisodeNumber = () => {
	const isHboDomain = window.location.hostname.includes('hbo') || window.location.hostname.includes('max');

	const methods: Array<() => number | null> = [
		() => (isHboDomain ? extractEpisodeFromHbo() : null),
		() => {
			if (isHboDomain) {
				return null;
			}
			const bodyText = document.body ? document.body.textContent ?? '' : '';
			if (!bodyText) {
				return null;
			}
			const patterns = [
				/\bS\s*\d+\s*E\s*(\d+)\b/i,
				/Season\s+\d+\s+Episode\s+(\d+)/i,
				/(?:You are watching|Now Playing|Current)[^\d]*Episode\s+(\d+)/i,
				/Episode\s+(\d+)/i,
				/Ep\.?\s+(\d+)/i
			];
			for (const pattern of patterns) {
				const match = bodyText.match(pattern);
				if (match) {
					console.log('[ReWatch Parent] Found episode from text:', match[1]);
					return parseInt(match[1], 10);
				}
			}
			return null;
		},
		() => {
			const activeSelectors = [
				'.ep-item.active',
				'.episode-item.active',
				'[class*="episode"].active',
				'.selected[class*="episode"]',
				'.current[class*="episode"]',
				'[aria-selected="true"][class*="episode"]',
				'[data-selected="true"]'
			];
			for (const selector of activeSelectors) {
				const activeElement = document.querySelector(selector);
				if (activeElement && activeElement.textContent) {
					const match = activeElement.textContent.match(/(\d+)/);
					if (match) {
						console.log('[ReWatch Parent] Found episode from active element:', match[1]);
						return parseInt(match[1], 10);
					}
				}
			}
			return null;
		},
		() => {
			const urlParams = new URLSearchParams(window.location.search);
			const possibleParams = ['ep', 'episode', 'episodeId', 'e'];
			for (const param of possibleParams) {
				const value = urlParams.get(param);
				if (!value) {
					continue;
				}
				const match = value.match(/(\d+)/);
				if (match) {
					console.log('[ReWatch Parent] Found episode from URL param:', match[1]);
					return parseInt(match[1], 10);
				}
			}
			return null;
		},
		() => {
			const urlPath = window.location.pathname;
			const patterns = [
				/episode[_-]?(\d+)/i,
				/ep[_-]?(\d+)/i,
				/\/e(\d+)\b/i,
				/\/(\d+)$/
			];
			for (const pattern of patterns) {
				const match = urlPath.match(pattern);
				if (match) {
					console.log('[ReWatch Parent] Found episode from URL path:', match[1]);
					return parseInt(match[1], 10);
				}
			}
			return null;
		},
		() => {
			const metaSelectors = [
				'meta[property="episode"]',
				'meta[name="episode"]',
				'meta[itemprop="episodeNumber"]'
			];
			for (const selector of metaSelectors) {
				const meta = document.querySelector(selector) as HTMLMetaElement | null;
				if (meta && meta.content) {
					const match = meta.content.match(/(\d+)/);
					if (match) {
						console.log('[ReWatch Parent] Found episode from meta tag:', match[1]);
						return parseInt(match[1], 10);
					}
				}
			}
			return null;
		}
	];

	for (const method of methods) {
		const episodeNum = method();
		if (episodeNum !== null && episodeNum > 0) {
			return episodeNum;
		}
	}

	console.log('[ReWatch Parent] Could not find episode number');
	return null;
};

const extractSeasonFromHbo = (): number | null => {
	const seasonEpisodeEl = document.querySelector('[data-testid="player-ux-season-episode"]');
	if (seasonEpisodeEl && seasonEpisodeEl.textContent) {
		const text = seasonEpisodeEl.textContent.trim();
		const match = text.match(/S\s*(\d+)\s*E\s*\d+/i);
		if (match) {
			console.log('[ReWatch Parent] Found HBO Max season from dedicated element:', match[1]);
			return parseInt(match[1], 10);
		}
	}
	console.log('[ReWatch Parent] HBO Max: No season-episode element found, not a series');
	return null;
};

const detectSeasonNumber = () => {
	const isHboDomain = window.location.hostname.includes('hbo') || window.location.hostname.includes('max');

	const methods: Array<() => number | null> = [
		() => (isHboDomain ? extractSeasonFromHbo() : null),
		() => {
			if (isHboDomain) {
				return null;
			}
			const bodyText = document.body ? document.body.textContent ?? '' : '';
			if (!bodyText) {
				return null;
			}
			const patterns = [
				/Season\s+(\d+)/i,
				/Series\s+(\d+)/i,
				/\bS\s*(\d+)\s*E\s*\d+\b/i,
				/\bS(\d+)E\d+\b/i
			];
			for (const pattern of patterns) {
				const match = bodyText.match(pattern);
				if (match && parseInt(match[1], 10) > 0) {
					console.log('[ReWatch Parent] Found season from text:', match[1]);
					return parseInt(match[1], 10);
				}
			}
			return null;
		},
		() => {
			const url = window.location.href;
			const patterns = [
				/season[_-]?(\d+)/i,
				/series[_-]?(\d+)/i,
				/\/s(\d+)e\d+/i,
				/\/s(\d+)\//i
			];
			for (const pattern of patterns) {
				const match = url.match(pattern);
				if (match && parseInt(match[1], 10) > 0) {
					console.log('[ReWatch Parent] Found season from URL:', match[1]);
					return parseInt(match[1], 10);
				}
			}
			return null;
		},
		() => {
			const metaSelectors = [
				'meta[property="season"]',
				'meta[name="season"]',
				'meta[itemprop="seasonNumber"]'
			];
			for (const selector of metaSelectors) {
				const meta = document.querySelector(selector) as HTMLMetaElement | null;
				if (meta && meta.content) {
					const match = meta.content.match(/(\d+)/);
					if (match && parseInt(match[1], 10) > 0) {
						console.log('[ReWatch Parent] Found season from meta tag:', match[1]);
						return parseInt(match[1], 10);
					}
				}
			}
			return null;
		}
	];

	for (const method of methods) {
		const seasonNum = method();
		if (seasonNum !== null && seasonNum > 0) {
			return seasonNum;
		}
	}

	console.log('[ReWatch Parent] Could not find season number');
	return null;
};

const initializeParentBroadcast = () => {
	if (typeof window === 'undefined') {
		return;
	}

	if (window.self !== window.top) {
		return;
	}

	const globalWindow = window as ReWatchWindow;
	const root = globalWindow.ReWatch;
	const titleModule = root?.core?.title;
	if (!titleModule) {
		return;
	}

	const handleReadyState = () => startTitleObserver(titleModule);

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', handleReadyState, { once: true });
	} else {
		handleReadyState();
	}

	scheduleInitialTitleRefresh(titleModule);

	window.addEventListener('message', (event: MessageEvent<ParentInfoMessage | RequestMessage>) => {
		if (event.data && event.data.type === 'ReWatch_REQUEST_INFO') {
			const structuredInfo = parseCrunchyrollStructuredData();
			let episodeNumber = structuredInfo?.episodeNumber ?? null;
			if (episodeNumber === null) {
				episodeNumber = detectEpisodeNumber();
			}
			let seasonNumber = structuredInfo?.seasonNumber ?? null;
			if (seasonNumber === null) {
				seasonNumber = detectSeasonNumber();
			}
			const canonicalUrl = structuredInfo?.canonicalUrl ?? window.location.href;
			const pageInfo: ParentInfoMessage = {
				type: 'ReWatch_PARENT_INFO',
				url: canonicalUrl,
				title: titleModule.getPageTitle(),
				episodeNumber: episodeNumber ?? undefined,
				seasonNumber: seasonNumber ?? undefined,
				seriesTitle: structuredInfo?.seriesTitle,
				episodeTitle: structuredInfo?.episodeTitle,
				canonicalUrl,
				contentType: structuredInfo?.contentType
			};

			const target = event.source as Window | null;
			if (target && typeof target.postMessage === 'function') {
				target.postMessage(pageInfo, '*');
				console.log('[ReWatch] Sent parent info to iframe:', pageInfo);
			}
		}
	});
};

initializeParentBroadcast();

type RequestMessage = {
	type: 'ReWatch_REQUEST_INFO';
};

export {
	detectEpisodeNumber,
	detectSeasonNumber
};
