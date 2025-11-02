import { DEFAULT_SETTINGS, ReWatchSettings } from '@shared/settings';
import type { ReWatchNamespace } from './namespace';

type LoggingMetadata = {
  getDebugLoggingEnabled: () => boolean;
  setDebugLoggingEnabled: (enabled: boolean) => void;
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

type GetSettingsResponse = {
  success: boolean;
  data?: ReWatchSettings;
};

type ChromeRuntime = {
  sendMessage?: (
    message: { action: 'getSettings' },
    responseCallback?: (response: GetSettingsResponse) => void
  ) => void;
  onMessage?: {
    addListener: (
      callback: (
        message: { action?: string; settings?: ReWatchSettings },
        sender: unknown,
        sendResponse: (response: unknown) => void
      ) => void
    ) => void;
  };
};

type ChromeWindow = typeof window & {
  chrome?: {
    runtime?: ChromeRuntime;
  };
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
  const originalConsoleLog = console.log.bind(console);
  let debugLoggingEnabled = DEFAULT_SETTINGS.debugLoggingEnabled;
  const patchedLog = (...args: Parameters<typeof console.log>) => {
    if (
      debugLoggingEnabled ||
      args.length === 0 ||
      typeof args[0] !== 'string' ||
      !args[0].startsWith('[ReWatch')
    ) {
      originalConsoleLog(...args);
    }
  };
  console.log = patchedLog;
  const chromeRuntime = (window as ChromeWindow).chrome?.runtime;
  const applyDebugLogging = (enabled: boolean) => {
    debugLoggingEnabled = enabled;
  };
  const requestSettings = () => {
    if (!chromeRuntime?.sendMessage) {
      return;
    }
    try {
      chromeRuntime.sendMessage({ action: 'getSettings' }, (response) => {
        if (!response || !response.success || !response.data) {
          return;
        }
        applyDebugLogging(response.data.debugLoggingEnabled);
      });
    } catch (error) {
      originalConsoleLog('[ReWatch] Failed to load settings:', error);
    }
  };
  if (chromeRuntime?.onMessage?.addListener) {
    chromeRuntime.onMessage.addListener((message) => {
      if (!message || message.action !== 'settingsUpdated') {
        return;
      }
      if (message.settings && typeof message.settings.debugLoggingEnabled === 'boolean') {
        applyDebugLogging(message.settings.debugLoggingEnabled);
      }
    });
  }
  requestSettings();
  core.loggingInitialized = true;
  core.logging = Object.freeze({
    getDebugLoggingEnabled: () => debugLoggingEnabled,
    setDebugLoggingEnabled: applyDebugLogging,
    originalConsoleLog,
    patchedLog
  });
};

initializeLogging();

export type { LoggingMetadata };
