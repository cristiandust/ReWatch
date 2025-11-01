type ExistingReWatch = {
  version?: string;
  core?: Record<string, unknown>;
  constants?: Record<string, unknown>;
  detectors?: unknown[];
  platformRegistry?: unknown;
};

type ReWatchNamespace = {
  version: string;
  core: Record<string, unknown>;
  constants: Record<string, unknown>;
  detectors: unknown[];
  platformRegistry: unknown;
};

type ReWatchWindow = typeof window & {
  ReWatch?: ExistingReWatch;
};

const initializeNamespace = () => {
  if (typeof window === 'undefined') {
    return;
  }
  const globalWindow = window as ReWatchWindow;
  const existing = globalWindow.ReWatch ?? {};
  const namespace: ReWatchNamespace = {
    version: '2.2.0-dev',
    ...existing,
    core: existing.core ?? {},
    constants: existing.constants ?? {},
    detectors: existing.detectors ?? [],
    platformRegistry: existing.platformRegistry ?? null
  };
  globalWindow.ReWatch = namespace;
};

initializeNamespace();

export type { ReWatchNamespace };