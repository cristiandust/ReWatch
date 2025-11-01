import type { ReWatchNamespace } from './namespace';

type ParentInfoMessage = {
	type: 'ReWatch_PARENT_INFO';
	url?: string;
	title?: string;
	episodeNumber?: number;
	seasonNumber?: number;
	seriesTitle?: string;
	episodeTitle?: string;
	canonicalUrl?: string;
	contentType?: 'episode' | 'movie';
};

type RequestMessage = {
	type: 'ReWatch_REQUEST_INFO';
};

type ParentBroadcastApi = {
	requestParentContext?: () => void;
};

type ReWatchIframeWindow = Window & {
	ReWatch?: ReWatchNamespace & {
		parentBroadcast?: ParentBroadcastApi;
	};
	ReWatchParentUrl?: string;
	ReWatchParentTitle?: string;
	ReWatchParentEpisode?: number;
	ReWatchParentSeason?: number;
	ReWatchParentSeriesTitle?: string;
	ReWatchParentEpisodeTitle?: string;
	ReWatchParentCanonicalUrl?: string;
	ReWatchParentContentType?: string;
};

const initializeIframeProxy = () => {
	if (typeof window === 'undefined') {
		return;
	}

	const iframeWindow = window as ReWatchIframeWindow;

	if (window.self === window.top) {
		return;
	}

	window.addEventListener('message', (event: MessageEvent<ParentInfoMessage>) => {
		if (event.data && event.data.type === 'ReWatch_PARENT_INFO') {
			iframeWindow.ReWatchParentUrl = event.data.url;
			iframeWindow.ReWatchParentTitle = event.data.title;
			iframeWindow.ReWatchParentEpisode = event.data.episodeNumber;
			iframeWindow.ReWatchParentSeason = event.data.seasonNumber;
			iframeWindow.ReWatchParentSeriesTitle = event.data.seriesTitle;
			iframeWindow.ReWatchParentEpisodeTitle = event.data.episodeTitle;
			iframeWindow.ReWatchParentCanonicalUrl = event.data.canonicalUrl;
			iframeWindow.ReWatchParentContentType = event.data.contentType;
			console.log('[ReWatch] Received parent info:', {
				url: event.data.url,
				title: event.data.title,
				episodeNumber: event.data.episodeNumber,
				seasonNumber: event.data.seasonNumber,
				seriesTitle: event.data.seriesTitle,
				episodeTitle: event.data.episodeTitle,
				canonicalUrl: event.data.canonicalUrl,
				contentType: event.data.contentType
			});
		}
	});

const requestParentContext = () => {
	try {
		const message: RequestMessage = { type: 'ReWatch_REQUEST_INFO' };
		window.parent.postMessage(message, '*');
	} catch (error) {
		console.log('[ReWatch] Could not request parent info:', (error as Error).message);
	}
};

	const namespace = iframeWindow.ReWatch as (ReWatchNamespace & { parentBroadcast?: ParentBroadcastApi }) | undefined;
	if (namespace) {
		const parentBroadcast = namespace.parentBroadcast ?? {};
		parentBroadcast.requestParentContext = requestParentContext;
		namespace.parentBroadcast = parentBroadcast;
	}

	requestParentContext();
};

initializeIframeProxy();

export type { ParentInfoMessage };
