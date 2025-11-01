import type { ReWatchNamespace } from '../core/namespace';

type EpisodeInference = {
	season?: number;
	episode?: number;
	seriesTitle?: string;
	episodeName?: string;
};

type ContentType = 'movie' | 'episode';

type VideoCollection = HTMLVideoElement[] | null | undefined;

class PlatformDetector {
	hostname: string;

	constructor(hostname: string) {
		this.hostname = hostname;
	}

	canDetect(): boolean {
		return false;
	}

	getPlatformName(): string | null {
		return null;
	}

	extractEpisodeNumber(): number | null {
		return null;
	}

	extractSeasonNumber(): number | null {
		return null;
	}

	extractTitle(): string | null {
		return null;
	}

	extractEpisodeName(): string | null {
		return null;
	}

	inferEpisodeInfoFromTitle(title: string | null): EpisodeInference | null {
		void title;
		return null;
	}

	getContentType(): ContentType | null {
		return null;
	}

	isValidPlaybackPage(metadata?: Record<string, unknown>): boolean {
		void metadata;
		return true;
	}

	filterVideoElements(videoElements: VideoCollection): HTMLVideoElement[] {
		return Array.isArray(videoElements) ? videoElements : [];
	}

	selectVideoElement(videoElements?: VideoCollection): HTMLVideoElement | null {
		void videoElements;
		return null;
	}
}

type CoreWithDetector = ReWatchNamespace['core'] & {
	PlatformDetector?: typeof PlatformDetector;
};

type ReWatchWithCore = ReWatchNamespace & {
	core: CoreWithDetector;
};

type ReWatchWindow = typeof window & {
	ReWatch?: ReWatchWithCore;
};

const initializePlatformDetectorBase = () => {
	if (typeof window === 'undefined') {
		return;
	}

	const globalWindow = window as ReWatchWindow;
	const root = globalWindow.ReWatch;
	if (!root) {
		return;
	}

	const core = root.core as CoreWithDetector;
	core.PlatformDetector = PlatformDetector;
};

initializePlatformDetectorBase();

export { PlatformDetector };
export type { EpisodeInference, ContentType };
