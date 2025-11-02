export type ReWatchSettings = {
  debugLoggingEnabled: boolean;
  detectorTelemetryRetentionHours: number;
  detectorHeartbeatSeconds: number;
};

export const DEFAULT_SETTINGS: ReWatchSettings = {
  debugLoggingEnabled: false,
  detectorTelemetryRetentionHours: 24,
  detectorHeartbeatSeconds: 300
};
