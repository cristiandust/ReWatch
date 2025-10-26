(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window;
  const existing = root.ReWatch || {};

  root.ReWatch = {
    version: '2.2.0-dev',
    ...existing,
    core: existing.core || {},
    constants: existing.constants || {},
    detectors: existing.detectors || [],
    platformRegistry: existing.platformRegistry || null
  };
})();
