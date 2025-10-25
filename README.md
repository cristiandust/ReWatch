# ReWatch – Streaming Progress Tracker

ReWatch is a Chrome extension that automatically tracks playback progress on Netflix, Disney+, HBO Max, and HiAnime. It saves where you left off for each title, surfaces that history in a lightweight popup UI, and lets you resume or manage entries with a single click.

---

## Table of contents

1. [Overview](#overview)
2. [Supported platforms](#supported-platforms)
3. [Key features](#key-features)
4. [Architecture](#architecture)
5. [Permissions & host access](#permissions--host-access)
6. [Getting started](#getting-started)
7. [Development workflow](#development-workflow)
8. [Testing & quality checks](#testing--quality-checks)
9. [Build & packaging](#build--packaging)
10. [Chrome Web Store submission checklist](#chrome-web-store-submission-checklist)
11. [Troubleshooting](#troubleshooting)
12. [Roadmap](#roadmap)
13. [Privacy](#privacy)
14. [License](#license)

---

## Overview

ReWatch installs a manifest v3 content script on the four supported streaming platforms. When it detects an active HTML5 `<video>` element, it extracts title, episode, and season metadata, then saves progress to Chrome Storage every few seconds. A popup UI lets you browse everything you have watched, jump back into a title, delete entries, clear completed items, or export the raw data.

## Supported platforms

ReWatch intentionally focuses on a small, well-tested set of services:

| Platform   | Playback domains                                                                 |
|------------|------------------------------------------------------------------------------------|
| Netflix    | `https://www.netflix.com`                                                          |
| Disney+    | `https://www.disneyplus.com`                                                       |
| HBO Max    | `https://play.max.com`, `https://play.hbomax.com`, `https://www.hbomax.com`        |
| HiAnime    | `https://hianime.to`, `https://aniwatch.to` and their subdomains                   |

Other streaming sites are intentionally out of scope to keep the heuristics accurate and the requested permissions minimal.

## Key features

- **Automatic progress tracking** – Saves current time, duration, and percentage every five seconds (and on pause/end events).
- **Accurate metadata** – Platform-specific detectors parse series titles, season/episode numbers, and episode names when available.
- **Resume prompts** – Offers to resume a title when returning with more than 30 seconds watched and less than 95% completion.
- **Rich popup dashboard** – Filter by movies or episodes, view history chronologically, open content in a new tab, or delete entries.
- **JSON export** – Download your entire watch history for backup or analysis.
- **Local-first** – All data is stored in the browser via the Chrome Storage API; nothing leaves the device.

## Architecture

```
ReWatch/
├─ manifest.json        # Extension configuration (MV3)
├─ background.js        # Service worker: storage orchestration & deduplication
├─ content.js           # Platform detectors, progress capture, resume prompts
├─ popup.html           # Popup layout
├─ popup.css            # Popup styles
├─ popup.js             # Popup logic (filters, export, open/delete actions)
├─ icons/               # Extension icons (16/32/48/128 px)
├─ debug.html/js        # Optional in-browser debugging helpers
└─ README.md            # This document
```

### Execution flow

1. **Content script (`content.js`)** loads on supported domains, discovers the main `<video>` element, and attaches progress listeners.
2. Extracted metadata is sent to **`background.js`** which normalizes the payload, persists it in Chrome Storage, and deduplicates episodic entries per series.
3. The **popup** reads the stored items, renders them with progress bars, and exposes management actions.

## Permissions & host access

| Type              | Value                                            | Reasoning                                                          |
|-------------------|--------------------------------------------------|---------------------------------------------------------------------|
| `storage`         | –                                                | Persist progress and popup preferences locally.                     |
| `tabs`            | –                                                | Open tracked titles in new tabs from the popup.                     |
| `downloads`       | –                                                | Export watch history as a JSON file.                                |
| Host permissions  | Netflix, Disney+, HBO Max, HiAnime domains       | Inject content script only on supported streaming sites.            |

No other network access or optional permissions are requested. Reviewers can confirm the extension never transmits data off-device.

## Getting started

### Install from source (developer mode)

1. **Clone the repository**
   ```bash
   git clone https://github.com/<your-account>/ReWatch.git
   cd ReWatch
   ```
2. **Open Chrome’s extensions page** – navigate to `chrome://extensions/` and enable **Developer mode**.
3. **Load the unpacked extension** – click **Load unpacked**, choose the project root (`ReWatch/`), and confirm the extension appears in the list.
4. **Pin the action icon** (optional) – click the puzzle icon in the toolbar, then pin “ReWatch”.

### Upgrading during development

After editing any files, refresh the extension from `chrome://extensions/` (click the circular arrow on the ReWatch card) and reload the target streaming tab to re-run detection.

## Development workflow

- **Logging** – All runtime logs are prefixed with `[ReWatch]` (or `[ReWatch][Platform]`) and appear in the tab’s DevTools console for content scripts, or via the “service worker” link on the extensions page for background logs.
- **Mutation observers** – The content script automatically redetects the main video when SPA navigation occurs; no manual reload is required on supported sites.
- **Icon assets** – Replace the placeholder PNGs in `icons/` before shipping. Use `generate-icons.html` or your preferred design tool—Chrome Web Store requires crisp assets at all sizes.

## Testing & quality checks

Automated tests are not yet defined. Use the following manual pass criteria before release:

1. **Playback smoke tests** – Start a movie and an episode on each supported service. Verify progress entries appear, update, and deduplicate (series episodes should collapse to the latest entry).
2. **Resume prompts** – Refresh the page after watching ≥30 seconds and confirm the resume overlay appears.
3. **Popup QA** – Confirm filters, export, delete, and “open in new tab” actions work. Ensure the JSON export downloads successfully (requires the new `downloads` permission).
4. **Storage inspection** – From `chrome://extensions/` → ReWatch → “Inspect views” → Service worker, check the console for warnings or errors.

Document any manual results in release notes if submitting to the Chrome Web Store.

## Build & packaging

ReWatch has no build step—pack the existing sources as-is. Before packaging:

1. **Update the version** in `manifest.json` (`"version": "x.y.z"`). Chrome Web Store requires monotonically increasing versions.
2. **Replace placeholder icons** in `icons/` with production-ready assets (16, 32, 48, 128 px PNG).
3. **Review permissions** – Confirm only the required hosts are listed; adjust if new platforms were added.
4. **Clear debug artifacts** – Remove residual logs or commented code that should not ship.

### Create the ZIP (Windows PowerShell example)

```powershell
$root = "path\to\ReWatch"
$zipPath = "$root\dist\rewatch-2.1.0.zip"
New-Item -ItemType Directory -Force (Split-Path $zipPath) | Out-Null
Compress-Archive -Path "$root\*" -DestinationPath $zipPath -Force
```

Ensure `dist/rewatch-2.1.0.zip` contains only the production assets—no `.git`, docs, or tooling directories if you prefer to exclude them.

## Chrome Web Store submission checklist

| Step | Description |
|------|-------------|
| 1 | Run through the manual QA checklist on every supported service. |
| 2 | Verify `manifest.json` metadata (name, version, description, icons, permissions). |
| 3 | Capture marketing assets: 1280×800 screenshots, 440×280 tile, optional promo video. |
| 4 | Prepare the store listing text (short description ≤132 chars, full description ≤16k). |
| 5 | Draft a privacy policy page (static HTML or hosted doc) explicitly stating data is stored locally only. |
| 6 | Zip the extension as described above. |
| 7 | Upload to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/), fill out listing metadata, upload assets, and submit for review. |
| 8 | Monitor review feedback and address any policy questions (usually related to permissions or data use). |

## Troubleshooting

- **Video not detected** – Wait until playback starts; SPA navigations (e.g., Disney+) may require a few seconds for the content script to attach to the new player.
- **Resume overlay missing** – Ensure at least 30 seconds were watched and the title is under 95% complete.
- **Incorrect metadata** – Check the console for `[ReWatch]` logs to see how the title or episode was parsed; some pages gate metadata behind delayed DOM updates.
- **Export fails** – Confirm the `downloads` permission is granted and no browser policies block file downloads.

## Roadmap

- Series grouping and progress insights in the popup
- Optional data sync (Chrome Sync or user-provided backup destinations)
- Additional streaming services as opt-in modules with explicit permissions
- Automated unit tests for platform detectors

Contributions are welcome via issues or pull requests.

## Privacy

ReWatch stores all progress locally using the Chrome Storage API. No analytics, tracking pixels, or remote network calls are used. Users can delete their entire history from the popup or by clearing the extension’s storage area.

A ready-to-publish privacy statement lives in [`privacy-policy.html`](privacy-policy.html). Host this page publicly (for example, via GitHub Pages or another static host) and supply the public URL when submitting the Chrome Web Store listing.

## License

MIT License. See the `LICENSE` file if one is included; otherwise treat the repository contents as MIT-licensed per this statement.

---

Need help or want to report a bug? Open an issue in the repository and include reproduction steps plus any relevant `[ReWatch]` console output.
