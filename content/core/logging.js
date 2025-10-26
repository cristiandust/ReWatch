(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.ReWatch;
  if (root.core.loggingInitialized) {
    return;
  }

  const REWATCH_DEBUG_LOGGING = false;
  const originalConsoleLog = console.log.bind(console);
  const patchedLog = (...args) => {
    if (
      REWATCH_DEBUG_LOGGING ||
      !args.length ||
      typeof args[0] !== 'string' ||
      !args[0].startsWith('[ReWatch')
    ) {
      originalConsoleLog(...args);
    }
  };

  console.log = patchedLog;

  root.core.loggingInitialized = true;
  root.core.logging = Object.freeze({
    REWATCH_DEBUG_LOGGING,
    originalConsoleLog,
    patchedLog
  });
})();
