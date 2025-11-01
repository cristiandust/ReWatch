import type { ReWatchNamespace } from './namespace';

type LoggingMetadata = {
  REWATCH_DEBUG_LOGGING: boolean;
  originalConsoleLog: (...args: Parameters<typeof console.log>) => void;
  patchedLog: (...args: Parameters<typeof console.log>) => void;
};

type CoreWithLogging = ReWatchNamespace['core'] & {
  loggingInitialized?: boolean;
  logging?: LoggingMetadata;
};

type ReWatchWithLogging = ReWatchNamespace & {
  core: CoreWithLogging;
};

type ReWatchWindow = typeof window & {
  ReWatch?: ReWatchWithLogging;
};

const initializeLogging = () => {
  if (typeof window === 'undefined') {
    return;
  }
  const globalWindow = window as ReWatchWindow;
  const root = globalWindow.ReWatch;
  if (!root) {
    return;
  }
  const core = root.core as CoreWithLogging;
  if (core.loggingInitialized) {
    return;
  }
  const REWATCH_DEBUG_LOGGING = true;
  const originalConsoleLog = console.log.bind(console);
  const patchedLog = (...args: Parameters<typeof console.log>) => {
    if (
      REWATCH_DEBUG_LOGGING ||
      args.length === 0 ||
      typeof args[0] !== 'string' ||
      !args[0].startsWith('[ReWatch')
    ) {
      originalConsoleLog(...args);
    }
  };
  console.log = patchedLog;
  core.loggingInitialized = true;
  core.logging = Object.freeze({
    REWATCH_DEBUG_LOGGING,
    originalConsoleLog,
    patchedLog
  });
};

initializeLogging();

export type { LoggingMetadata };
