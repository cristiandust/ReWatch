import type { ReWatchNamespace } from './namespace';

type DetectorFactory<TDetector> = (hostname: string) => TDetector | null;

type PlatformRegistry<TDetector> = {
	registerDetector: (factory: DetectorFactory<TDetector>) => void;
	createDetectors: (hostname: string) => TDetector[];
	getFactories: () => DetectorFactory<TDetector>[];
};

type ReWatchWindow = typeof window & {
	ReWatch?: ReWatchNamespace & {
		platformRegistry?: PlatformRegistry<unknown>;
	};
};

const initializePlatformRegistry = () => {
	if (typeof window === 'undefined') {
		return;
	}

	const globalWindow = window as ReWatchWindow;
	const root = globalWindow.ReWatch;
	if (!root) {
		return;
	}

	const factories: DetectorFactory<unknown>[] = [];

	const registerDetector = (factory: DetectorFactory<unknown>) => {
		if (typeof factory !== 'function') {
			return;
		}
		if (factories.includes(factory)) {
			return;
		}
		factories.push(factory);
	};

	const createDetectors = (hostname: string) => factories
		.map((factory) => {
			try {
				return factory(hostname);
			} catch (error) {
				console.log('[ReWatch] Detector factory error:', (error as Error).message);
				return null;
			}
		})
		.filter((detector): detector is object => Boolean(detector));

	root.platformRegistry = Object.freeze<PlatformRegistry<unknown>>({
		registerDetector,
		createDetectors,
		getFactories: () => factories.slice()
	});
};

initializePlatformRegistry();

export type { PlatformRegistry, DetectorFactory };
