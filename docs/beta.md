# ReWatch Beta Program

_Last updated: November 2, 2025_

## Program overview

The ReWatch beta channel gives early access to new detectors, popup features, and performance improvements ahead of public releases. Beta builds may contain unfinished functionality, but your feedback helps stabilize the extension before it ships to everyone.

## Eligibility

- Active ReWatch user on Chrome 120 or later.
- Comfortable installing unpacked extensions from `dist/` builds.
- Willing to share reproduction steps, screenshots, or logs when reporting issues.

## How to enroll

1. Clone the repository and checkout the `main` branch.
2. Run `npm install` followed by `npm run build:beta` (falls back to `npm run build:dev` if missing).
3. In Chrome, visit `chrome://extensions`, enable Developer Mode, and load the unpacked `dist/` directory.
4. Pin the ReWatch action icon and confirm the popup label displays `Beta`.

## Reporting feedback

- **GitHub Issues:** Use the `beta` label and include platform, URL, steps, and console logs when applicable.
- **Email:** Send details to `ancientee@gmail.com` with "ReWatch Beta" in the subject.
- **Fast feedback form:** Coming soon on the docs site.

## Troubleshooting

- **Extension fails to load:** Re-run the build command and ensure the manifest version increments automatically.
- **Detector not firing:** Confirm the beta build includes the platform (check `src/content/platform-detectors`).
- **Popup blank:** Open DevTools for the popup window and capture console errors.
- **Regression found:** File an issue and roll back to the latest stable release (`npm run build`).

## Staying up to date

- Pull the latest `main` branch weekly to get new beta features.
- Watch the `#beta` section in `docs/roadmap.md` for milestones and release notes.
- Beta announcements also appear in GitHub Discussions under "Announcements".

Thank you for helping shape the future of ReWatch!
