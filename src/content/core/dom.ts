import type { ReWatchNamespace } from './namespace';

type DomConstants = {
	IGNORED_TITLE_KEYWORDS: readonly string[];
	ALLOWED_TITLE_CONTAINER_KEYWORDS: readonly string[];
	UP_NEXT_KEYWORDS: readonly string[];
};

type ReWatchWindow = typeof window & {
	ReWatch?: ReWatchNamespace;
};

const getConstants = (): DomConstants | null => {
	if (typeof window === 'undefined') {
		return null;
	}
	const globalWindow = window as ReWatchWindow;
	const root = globalWindow.ReWatch;
	if (!root) {
		return null;
	}
	const constants = root.constants as Partial<DomConstants> | undefined;
	if (!constants) {
		return null;
	}
	const { IGNORED_TITLE_KEYWORDS, ALLOWED_TITLE_CONTAINER_KEYWORDS, UP_NEXT_KEYWORDS } = constants;
	if (!IGNORED_TITLE_KEYWORDS || !ALLOWED_TITLE_CONTAINER_KEYWORDS || !UP_NEXT_KEYWORDS) {
		return null;
	}
	return {
		IGNORED_TITLE_KEYWORDS,
		ALLOWED_TITLE_CONTAINER_KEYWORDS,
		UP_NEXT_KEYWORDS
	};
};

const FALLBACK_CONSTANTS: DomConstants = {
	IGNORED_TITLE_KEYWORDS: Object.freeze([
		'subtitle',
		'sub-title',
		'synopsis',
		'description',
		'dialog',
		'dialogue',
		'caption',
		'tooltip',
		'trailer'
	]),
	ALLOWED_TITLE_CONTAINER_KEYWORDS: Object.freeze([
		'title-bug',
		'playback-title',
		'player-title',
		'details-title'
	]),
	UP_NEXT_KEYWORDS: Object.freeze([
		'up-next',
		'up next',
		'next episode',
		'coming up'
	])
};

const isWithinAllowedTitleContainer = (node: Node, constants: DomConstants): boolean => {
	let current: Node | null = node;

	while (current) {
		if (current.nodeType !== Node.ELEMENT_NODE) {
			break;
		}

		const element = current as Element;

		if (element.id) {
			const id = element.id.toLowerCase();
			if (constants.ALLOWED_TITLE_CONTAINER_KEYWORDS.some((keyword) => id.includes(keyword))) {
				return true;
			}
		}

		if (element.classList && element.classList.length > 0) {
			for (const cls of element.classList) {
				if (cls && constants.ALLOWED_TITLE_CONTAINER_KEYWORDS.some((keyword) => cls.toLowerCase().includes(keyword))) {
					return true;
				}
			}
		}

		if (typeof element.getAttribute === 'function') {
			const dataTestId = element.getAttribute('data-testid');
			if (dataTestId && constants.ALLOWED_TITLE_CONTAINER_KEYWORDS.some((keyword) => dataTestId.toLowerCase().includes(keyword))) {
				return true;
			}
		}

			if (element.parentElement) {
				current = element.parentElement;
				continue;
			}

			if (typeof element.getRootNode === 'function') {
				const rootNode = element.getRootNode();
				if (rootNode instanceof ShadowRoot && rootNode.host) {
					const host = rootNode.host as Element;
					if (host !== element) {
						current = host;
						continue;
					}
				}
			}

		break;
	}

	if (typeof (node as Element | Text | null)?.textContent === 'string') {
		const textContent = ((node as Element | Text).textContent ?? '').toLowerCase();
		if (textContent.includes('up next') || textContent.includes('next episode')) {
			return true;
		}
	}

	return false;
};

const shouldSkipTitleNode = (node: Node | null, constants: DomConstants): boolean => {
	if (!node) {
		return false;
	}

	if (isWithinAllowedTitleContainer(node, constants)) {
		return false;
	}

	let current: Node | null = node;

	while (current) {
		if (current.nodeType !== Node.ELEMENT_NODE) {
			break;
		}

		const element = current as Element;

		if (element.id) {
			const id = element.id.toLowerCase();
			if (constants.IGNORED_TITLE_KEYWORDS.some((keyword) => id.includes(keyword))) {
				return true;
			}
		}

		if (element.classList && element.classList.length > 0) {
			for (const cls of element.classList) {
				if (cls && constants.IGNORED_TITLE_KEYWORDS.some((keyword) => cls.toLowerCase().includes(keyword))) {
					return true;
				}
			}
		}

		if (typeof element.getAttribute === 'function') {
			const dataTestId = element.getAttribute('data-testid');
			if (dataTestId && constants.IGNORED_TITLE_KEYWORDS.some((keyword) => dataTestId.toLowerCase().includes(keyword))) {
				return true;
			}

			const ariaLabel = element.getAttribute('aria-label');
			if (ariaLabel && constants.IGNORED_TITLE_KEYWORDS.some((keyword) => ariaLabel.toLowerCase().includes(keyword))) {
				return true;
			}
		}

			if (element.parentElement) {
				current = element.parentElement;
				continue;
			}

			if (typeof element.getRootNode === 'function') {
				const rootNode = element.getRootNode();
				if (rootNode instanceof ShadowRoot && rootNode.host) {
					const host = rootNode.host as Element;
					if (host !== element) {
						current = host;
						continue;
					}
				}
			}

		break;
	}

	return false;
};

const getElementNode = (node: Node | null): Element | null => {
	if (!node) {
		return null;
	}

	if (node.nodeType === Node.ELEMENT_NODE) {
		return node as Element;
	}

	if ((node as ChildNode).parentElement) {
		return (node as ChildNode).parentElement;
	}

	if (typeof (node as Element).getRootNode === 'function') {
		const rootNode = (node as Element).getRootNode();
		if (rootNode && rootNode instanceof ShadowRoot && rootNode.host) {
			return rootNode.host as Element;
		}
	}

	return null;
};

const isNodeVisible = (node: Node | null): boolean => {
	let current: Element | null = getElementNode(node);

	while (current) {
		if (current.hasAttribute('hidden')) {
			return false;
		}

		const ariaHidden = current.getAttribute('aria-hidden');
		if (ariaHidden && ariaHidden.toLowerCase() === 'true') {
			return false;
		}

		try {
			const style = window.getComputedStyle(current);
			if (
				!style ||
				style.display === 'none' ||
				style.visibility === 'hidden' ||
				style.visibility === 'collapse' ||
				parseFloat(style.opacity || '1') === 0
			) {
				return false;
			}
		} catch (error) {
			console.log('[ReWatch] Failed to compute style for visibility check:', (error as Error).message);
		}

			if (current.parentElement) {
				current = current.parentElement;
				continue;
			}

			if (typeof current.getRootNode === 'function') {
				const rootNode = current.getRootNode();
				if (rootNode instanceof ShadowRoot && rootNode.host) {
					const host = rootNode.host as Element;
					if (host !== current) {
						current = host;
						continue;
					}
				}
			}

		break;
	}

	return true;
};

const isNodeInUpNextSection = (node: Node | null, constants: DomConstants): boolean => {
	let current: Element | null = getElementNode(node);

	while (current) {
		if (current.classList && current.classList.length > 0) {
			for (const cls of current.classList) {
				if (cls && constants.UP_NEXT_KEYWORDS.some((keyword) => cls.toLowerCase().includes(keyword))) {
					return true;
				}
			}
		}

		if (current.id) {
			const id = current.id.toLowerCase();
			if (constants.UP_NEXT_KEYWORDS.some((keyword) => id.includes(keyword))) {
				return true;
			}
		}

		if (typeof current.getAttribute === 'function') {
			const dataTestId = current.getAttribute('data-testid');
			if (dataTestId && constants.UP_NEXT_KEYWORDS.some((keyword) => dataTestId.toLowerCase().includes(keyword))) {
				return true;
			}

			const ariaLabel = current.getAttribute('aria-label');
			if (ariaLabel && constants.UP_NEXT_KEYWORDS.some((keyword) => ariaLabel.toLowerCase().includes(keyword))) {
				return true;
			}
		}

		if (current !== node) {
			const textContent = (current.textContent ?? '').toLowerCase();
			if (textContent && constants.UP_NEXT_KEYWORDS.some((keyword) => textContent.includes(keyword))) {
				return true;
			}
		}

			if (current.parentElement) {
				current = current.parentElement;
				continue;
			}

			if (typeof current.getRootNode === 'function') {
				const rootNode = current.getRootNode();
				if (rootNode instanceof ShadowRoot && rootNode.host) {
					const host = rootNode.host as Element;
					if (host !== current) {
						current = host;
						continue;
					}
				}
			}

		break;
	}

	return false;
};

const findAllVideoElements = (): HTMLVideoElement[] => {
	const videos = new Set<HTMLVideoElement>();
	const visitedRoots = new Set<Node>();

	const processRoot = (rootNode: Node | null) => {
		if (!rootNode || visitedRoots.has(rootNode)) {
			return;
		}

		if (!(rootNode instanceof Document || rootNode instanceof ShadowRoot)) {
			return;
		}

		visitedRoots.add(rootNode);

		try {
			rootNode.querySelectorAll('video').forEach((video) => {
				videos.add(video as HTMLVideoElement);
			});
		} catch (error) {
			console.log('[ReWatch] Unable to query videos from root:', (error as Error).message);
			return;
		}

		try {
			rootNode.querySelectorAll('*').forEach((element) => {
				const shadow = (element as Element).shadowRoot;
				if (shadow && !visitedRoots.has(shadow)) {
					processRoot(shadow);
				}
			});
		} catch (error) {
			console.log('[ReWatch] Unable to traverse root descendants:', (error as Error).message);
		}
	};

	processRoot(document);

	return Array.from(videos);
};

const findAcrossAllRoots = <T>(
	selectors: string | string[],
	handler: (node: Element, rootNode: Document | ShadowRoot) => T | null | undefined
): T | null => {
	const normalizedSelectors = Array.isArray(selectors)
		? selectors.filter((selector): selector is string => Boolean(selector))
		: [selectors].filter((selector): selector is string => Boolean(selector));

	if (!normalizedSelectors.length || typeof handler !== 'function') {
		return null;
	}

	const visitedRoots = new Set<Node>();
	const queue: Array<Document | ShadowRoot> = [document];

	while (queue.length) {
		const rootNode = queue.shift();
		if (!rootNode || visitedRoots.has(rootNode)) {
			continue;
		}

		visitedRoots.add(rootNode);

		for (const selector of normalizedSelectors) {
			if (typeof selector !== 'string' || !selector.trim()) {
				continue;
			}

			let nodes: NodeListOf<Element>;
			try {
				nodes = rootNode.querySelectorAll(selector);
			} catch (error) {
				console.log('[ReWatch] Unable to query selector during deep search:', selector, (error as Error).message);
				continue;
			}

			for (const node of nodes) {
				try {
					const result = handler(node, rootNode);
					if (result) {
						return result;
					}
				} catch (error) {
					console.log('[ReWatch] Error evaluating deep search node:', (error as Error).message);
				}
			}
		}

		try {
			rootNode.querySelectorAll('*').forEach((element) => {
				const shadow = (element as Element).shadowRoot;
				if (shadow && !visitedRoots.has(shadow)) {
					queue.push(shadow);
				}
			});
		} catch (error) {
			console.log('[ReWatch] Unable to traverse descendants during deep search:', (error as Error).message);
		}
	}

	return null;
};

const applyDomModule = (root: ReWatchNamespace, constants: DomConstants) => {
	root.core.dom = Object.freeze({
		isWithinAllowedTitleContainer: (node: Node) => isWithinAllowedTitleContainer(node, constants),
		shouldSkipTitleNode: (node: Node | null) => shouldSkipTitleNode(node, constants),
		getElementNode,
		isNodeVisible,
		isNodeInUpNextSection: (node: Node | null) => isNodeInUpNextSection(node, constants),
		findAllVideoElements,
		findAcrossAllRoots
	});
};

const initializeDomModule = () => {
	if (typeof window === 'undefined') {
		return;
	}

	const globalWindow = window as ReWatchWindow;
	const root = globalWindow.ReWatch;
	if (!root) {
		return;
	}

	const tryApply = (): boolean => {
		const constants = getConstants();
		if (constants) {
			applyDomModule(root, constants);
			return true;
		}
		return false;
	};

	if (tryApply()) {
		return;
	}

	applyDomModule(root, FALLBACK_CONSTANTS);

	let attempts = 0;
	const maxAttempts = 30;
	const interval = window.setInterval(() => {
		attempts += 1;
		if (tryApply() || attempts >= maxAttempts) {
			window.clearInterval(interval);
		}
	}, 200);
};

initializeDomModule();

export {
	findAcrossAllRoots,
	findAllVideoElements,
	getElementNode,
	isNodeInUpNextSection,
	isNodeVisible,
	isWithinAllowedTitleContainer,
	shouldSkipTitleNode
};
