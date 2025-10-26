# ReWatch - Streaming Progress Tracker

This is a Chrome extension project that tracks viewing progress across streaming platforms.

## Project Type
Chrome Extension (JavaScript)

## Supported Platforms
- Netflix
- Disney+
- HBO Max
- HiAnime

**Important:** Only these four platforms are supported. Any other platform should be ignored.

## Key Features
- Platform-specific video player detection
- Automatic progress tracking with platform-specific implementations
- Episode and movie watch history with accurate metadata
- Each supported platform has its own detector class

## Development Guidelines
- Use Chrome Extension Manifest V3
- Implement platform-specific detector classes (extends `PlatformDetector`)
- Use Chrome Storage API for persistence
- Each new platform requires a dedicated implementation
- Unsupported platforms must be filtered out in `saveProgress()`
