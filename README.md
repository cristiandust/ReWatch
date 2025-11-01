# ReWatch – Streaming Progress Tracker

ReWatch is a Chrome extension that automatically captures playback progress on Netflix, Disney+, HBO Max, HiAnime, Tubi, Crunchyroll, Plex, and Filmzie. Platform detectors extract metadata for the active title, the tracker normalizes timestamps, and the background service worker persists everything in Chrome Storage so you can resume from the popup at any time.

---

## Table of contents

1. [Overview](#overview)
2. [Supported platforms](#supported-platforms)
3. [Key features](#key-features)
4. [Architecture](#architecture)
5. [Permissions](#permissions)
6. [Getting started](#getting-started)
7. [Development workflow](#development-workflow)
8. [Testing](#testing)
9. [Build & packaging](#build--packaging)
10. [Troubleshooting](#troubleshooting)
11. [Roadmap](#roadmap)
12. [Privacy](#privacy)
13. [License](#license)

---

## Overview

ReWatch ships as a Manifest V3 extension written in TypeScript and bundled with webpack. Content scripts register platform detectors on supported domains, discover the main HTML5 `<video>` element, and stream progress updates to a shared tracker. The tracker consolidates metadata, relays it to the background service worker, and the popup UI renders the aggregated history with quick actions (resume, open, delete, export).

## Supported platforms

Each platform ships with a dedicated detector tuned for its DOM structure and playback quirks.

| Platform   | Playback domains |
|------------|------------------|
| Netflix    | `https://www.netflix.com` |
| Disney+    | `https://www.disneyplus.com` |
| HBO Max    | `https://play.max.com`, `https://play.hbomax.com`, `https://www.hbomax.com` |
| HiAnime    | `https://hianime.to`, `https://aniwatch.to`, `https://megacloud.blog` and subdomains |
| Tubi       | `https://tubitv.com` and subdomains |
| Crunchyroll| `https://www.crunchyroll.com` and subdomains |
| Plex       | `https://app.plex.tv`, `https://*.plex.tv` |
| Filmzie    | `https://filmzie.com`, `https://*.filmzie.com` |

## Key features

- Automatic progress tracking across all supported platforms with five-second sampling plus pause/end flushes.
- Platform-aware detectors that filter ads, pick the canonical `<video>`, and extract title, season, and episode metadata.
- Background service worker that deduplicates episodic entries, prunes stale completions, and stores data locally.
- Popup dashboard with movie/episode filters, resume buttons, quick links, deletion, and JSON export.
- Local-first design: no analytics, no remote calls, and full control over stored history.

## Architecture

```
ReWatch/
├─ manifest.json               # MV3 manifest
├─ src/
│  ├─ background/              # TypeScript entry for the service worker
│  ├─ content/
│  │  ├─ core/                 # Namespace bootstrap, constants, DOM utilities, registry
│  │  ├─ platform-detectors/   # Detector implementations (one per platform)
│  │  └─ video-tracker/        # Tracker that wires detectors to background messaging
│  └─ popup/                   # React popup UI (entry + components)
├─ public/                     # Static assets copied by webpack (manifest, icons, html)
├─ docs/                       # Architecture notes and marketing copy
├─ tests__/                    # Jest tests for background logic
├─ webpack.config.js           # Bundle configuration for background, content, popup
├─ package.json                # npm scripts and dependencies
└─ README.md                   # Project documentation
```

### Detector registry

Detectors extend `PlatformDetector` and register via the platform registry inside `src/content/core`. The registry selects the appropriate detector at runtime based on hostname.

| Platform   | Detector |
|------------|----------|
| Netflix    | `src/content/platform-detectors/netflix.ts` |
| Disney+    | `src/content/platform-detectors/disney-plus.ts` |
| HBO Max    | `src/content/platform-detectors/hbo-max.ts` |
| HiAnime    | `src/content/platform-detectors/hianime.ts` |
| Tubi       | `src/content/platform-detectors/tubi.ts` |
| Crunchyroll| `src/content/platform-detectors/crunchyroll.ts` |
| Plex       | `src/content/platform-detectors/plex.ts` |
| Filmzie    | `src/content/platform-detectors/filmzie.ts` |

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage`  | Persist watch history and popup preferences locally. |
| `tabs`     | Open tracked titles in new tabs from the popup. |
| `downloads`| Export the stored history as JSON. |
| Host access| Limit injection to the eight supported streaming domains. |

The extension is offline-first and does not contact external services.

## Getting started

1. Clone the repository:
   ```bash
   git clone https://github.com/cristian-dust/ReWatch.git
   cd ReWatch
   npm install
   ```
2. Build the extension (development or production):
   ```bash
   npm run build:dev   # watch mode optional
   npm run build       # production bundles in dist/
   ```
3. Load the unpacked extension from `dist/` via `chrome://extensions` with Developer Mode enabled.
4. Pin the action icon if you want quick access to the popup.

## Development workflow

- Use `npm run build:dev` for an iterative build while adjusting detectors or popup code.
- Logs from content scripts appear in the tab DevTools console; background logs are visible via the service worker link on `chrome://extensions`.
- When testing SPA platforms, reload the page after a build so mutation observers can attach to the refreshed DOM.

## Testing

- Automated: `npm test` runs Jest suites that cover background storage orchestration.
- Manual smoke plan:
  1. Play content on each supported platform and confirm progress entries appear in the popup.
  2. Pause near completion to trigger resume prompts when reopening the page.
  3. Validate JSON export and delete actions from the popup.

Record manual results before store submissions or major releases.

## Build & packaging

1. Run `npm run build` to produce production bundles in `dist/`.
2. Update `manifest.json` version fields to match the release.
3. Zip the contents of `dist/` for Chrome Web Store upload. Example (PowerShell):
   ```powershell
   $root = "A:\Master Race\Repos\ReWatch"
   $zipPath = "$root\dist\rewatch.zip"
   Remove-Item $zipPath -ErrorAction SilentlyContinue
   Compress-Archive -Path "$root\dist\*" -DestinationPath $zipPath
   ```

Ensure the archive only contains the files produced by the build pipeline plus required static assets.

## Troubleshooting

- **Detector not firing**: confirm the domain matches one of the supported host patterns and that playback reached the main `<video>` element.
- **Progress missing in popup**: inspect background logs for storage errors or skipped invalid pages.
- **Export blocked**: verify browser policies allow downloads initiated by extensions.
- **Stale entries**: use the popup delete action or clear Chrome Storage under the extension ID.

## Roadmap

- Series grouping and richer analytics in the popup.
- Optional sync connectors for user-managed backups.
- Detector sandbox suite to harden against platform redesigns.
- Broader automated coverage for content scripts.

## Privacy

All playback data remains local within Chrome Storage. No analytics, telemetry, or third-party APIs are invoked. Users may clear stored history at any time through the popup or by removing the extension.

See [`privacy-policy.html`](privacy-policy.html) for a store-ready policy text.

## License

ReWatch is distributed under the ReWatch Non-Commercial License. Review [`LICENSE`](LICENSE) for complete terms.

---

Need assistance or found a regression? Open an issue with reproduction steps plus any relevant `[ReWatch]` console logs.
