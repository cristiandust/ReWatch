(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  const factories = [];

  const registerDetector = (factory) => {
    if (typeof factory !== 'function') {
      return;
    }
    if (factories.includes(factory)) {
      return;
    }
    factories.push(factory);
  };

  const createDetectors = (hostname) => factories
    .map((factory) => {
      try {
        return factory(hostname);
      } catch (error) {
        console.log('[ReWatch] Detector factory error:', error.message);
        return null;
      }
    })
    .filter(Boolean);

  root.platformRegistry = Object.freeze({
    registerDetector,
    createDetectors,
    getFactories: () => factories.slice()
  });
})();
