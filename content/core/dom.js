(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const constants = root.constants;

  const isWithinAllowedTitleContainer = (node) => {
    let current = node;

    while (current) {
      if (current.nodeType !== Node.ELEMENT_NODE) {
        break;
      }

      if (current.id) {
        const id = current.id.toLowerCase();
        if (constants.ALLOWED_TITLE_CONTAINER_KEYWORDS.some((keyword) => id.includes(keyword))) {
          return true;
        }
      }

      if (current.classList && current.classList.length) {
        for (const cls of current.classList) {
          if (cls && constants.ALLOWED_TITLE_CONTAINER_KEYWORDS.some((keyword) => cls.toLowerCase().includes(keyword))) {
            return true;
          }
        }
      }

      if (typeof current.getAttribute === 'function') {
        const dataTestId = current.getAttribute('data-testid');
        if (dataTestId && constants.ALLOWED_TITLE_CONTAINER_KEYWORDS.some((keyword) => dataTestId.toLowerCase().includes(keyword))) {
          return true;
        }
      }

      if (current.parentElement) {
        current = current.parentElement;
        continue;
      }

      if (typeof current.getRootNode === 'function') {
        const rootNode = current.getRootNode();
        if (rootNode && rootNode.host && rootNode !== current) {
          current = rootNode.host;
          continue;
        }
      }

      break;
    }

    if (typeof node?.textContent === 'string') {
      const textContent = node.textContent.toLowerCase();
      if (textContent.includes('up next') || textContent.includes('next episode')) {
        return true;
      }
    }

    return false;
  };

  const shouldSkipTitleNode = (node) => {
    if (!node) {
      return false;
    }

    if (isWithinAllowedTitleContainer(node)) {
      return false;
    }

    let current = node;

    while (current) {
      if (current.nodeType !== Node.ELEMENT_NODE) {
        break;
      }

      if (current.id) {
        const id = current.id.toLowerCase();
        if (constants.IGNORED_TITLE_KEYWORDS.some((keyword) => id.includes(keyword))) {
          return true;
        }
      }

      if (current.classList && current.classList.length) {
        for (const cls of current.classList) {
          if (cls && constants.IGNORED_TITLE_KEYWORDS.some((keyword) => cls.toLowerCase().includes(keyword))) {
            return true;
          }
        }
      }

      if (typeof current.getAttribute === 'function') {
        const dataTestId = current.getAttribute('data-testid');
        if (dataTestId && constants.IGNORED_TITLE_KEYWORDS.some((keyword) => dataTestId.toLowerCase().includes(keyword))) {
          return true;
        }

        const ariaLabel = current.getAttribute('aria-label');
        if (ariaLabel && constants.IGNORED_TITLE_KEYWORDS.some((keyword) => ariaLabel.toLowerCase().includes(keyword))) {
          return true;
        }
      }

      if (current.parentElement) {
        current = current.parentElement;
        continue;
      }

      if (typeof current.getRootNode === 'function') {
        const rootNode = current.getRootNode();
        if (rootNode && rootNode.host && rootNode !== current) {
          current = rootNode.host;
          continue;
        }
      }

      break;
    }

    return false;
  };

  const getElementNode = (node) => {
    if (!node) {
      return null;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      return node;
    }

    if (node.parentElement) {
      return node.parentElement;
    }

    if (typeof node.getRootNode === 'function') {
      const rootNode = node.getRootNode();
      if (rootNode && rootNode.host) {
        return rootNode.host;
      }
    }

    return null;
  };

  const isNodeVisible = (node) => {
    let current = getElementNode(node);

    while (current) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        if (current.hasAttribute('hidden')) {
          return false;
        }

        const ariaHidden = current.getAttribute && current.getAttribute('aria-hidden');
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
          console.log('[ReWatch] Failed to compute style for visibility check:', error.message);
        }
      }

      if (current.parentElement) {
        current = current.parentElement;
        continue;
      }

      if (typeof current.getRootNode === 'function') {
        const rootNode = current.getRootNode();
        if (rootNode && rootNode.host && rootNode !== current) {
          current = rootNode.host;
          continue;
        }
      }

      break;
    }

    return true;
  };

  const isNodeInUpNextSection = (node) => {
    let current = getElementNode(node);

    while (current) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const element = current;

        if (element.classList && element.classList.length) {
          for (const cls of element.classList) {
            if (cls && constants.UP_NEXT_KEYWORDS.some((keyword) => cls.toLowerCase().includes(keyword))) {
              return true;
            }
          }
        }

        if (element.id) {
          const id = String(element.id).toLowerCase();
          if (constants.UP_NEXT_KEYWORDS.some((keyword) => id.includes(keyword))) {
            return true;
          }
        }

        if (typeof element.getAttribute === 'function') {
          const dataTestId = element.getAttribute('data-testid');
          if (dataTestId && constants.UP_NEXT_KEYWORDS.some((keyword) => dataTestId.toLowerCase().includes(keyword))) {
            return true;
          }

          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel && constants.UP_NEXT_KEYWORDS.some((keyword) => ariaLabel.toLowerCase().includes(keyword))) {
            return true;
          }
        }

        if (element !== node) {
          const textContent = (element.textContent || '').toLowerCase();
          if (textContent && constants.UP_NEXT_KEYWORDS.some((keyword) => textContent.includes(keyword))) {
            return true;
          }
        }
      }

      if (current.parentElement) {
        current = current.parentElement;
        continue;
      }

      if (typeof current.getRootNode === 'function') {
        const rootNode = current.getRootNode();
        if (rootNode && rootNode.host && rootNode !== current) {
          current = rootNode.host;
          continue;
        }
      }

      break;
    }

    return false;
  };

  const findAllVideoElements = () => {
    const videos = new Set();
    const visitedRoots = new Set();

    const processRoot = (rootNode) => {
      if (!rootNode || visitedRoots.has(rootNode) || typeof rootNode.querySelectorAll !== 'function') {
        return;
      }

      visitedRoots.add(rootNode);

      try {
        rootNode.querySelectorAll('video').forEach((video) => {
          videos.add(video);
        });
      } catch (error) {
        console.log('[ReWatch] Unable to query videos from root:', error.message);
        return;
      }

      try {
        rootNode.querySelectorAll('*').forEach((element) => {
          const shadow = element.shadowRoot;
          if (shadow && !visitedRoots.has(shadow)) {
            processRoot(shadow);
          }
        });
      } catch (error) {
        console.log('[ReWatch] Unable to traverse root descendants:', error.message);
      }
    };

    processRoot(document);

    return Array.from(videos);
  };

  const findAcrossAllRoots = (selectors, handler) => {
    const normalizedSelectors = Array.isArray(selectors)
      ? selectors.filter(Boolean)
      : [selectors].filter(Boolean);

    if (!normalizedSelectors.length || typeof handler !== 'function') {
      return null;
    }

    const visitedRoots = new Set();
    const queue = [document];

    while (queue.length) {
      const rootNode = queue.shift();
      if (!rootNode || visitedRoots.has(rootNode) || typeof rootNode.querySelectorAll !== 'function') {
        continue;
      }

      visitedRoots.add(rootNode);

      for (const selector of normalizedSelectors) {
        if (typeof selector !== 'string' || !selector.trim()) {
          continue;
        }

        let nodes;
        try {
          nodes = rootNode.querySelectorAll(selector);
        } catch (error) {
          console.log('[ReWatch] Unable to query selector during deep search:', selector, error.message);
          continue;
        }

        for (const node of nodes) {
          try {
            const result = handler(node, rootNode);
            if (result) {
              return result;
            }
          } catch (error) {
            console.log('[ReWatch] Error evaluating deep search node:', error.message);
          }
        }
      }

      try {
        rootNode.querySelectorAll('*').forEach((element) => {
          const shadow = element && element.shadowRoot;
          if (shadow && !visitedRoots.has(shadow)) {
            queue.push(shadow);
          }
        });
      } catch (error) {
        console.log('[ReWatch] Unable to traverse descendants during deep search:', error.message);
      }
    }

    return null;
  };

  root.core.dom = Object.freeze({
    isWithinAllowedTitleContainer,
    shouldSkipTitleNode,
    getElementNode,
    isNodeVisible,
    isNodeInUpNextSection,
    findAllVideoElements,
    findAcrossAllRoots
  });
})();
