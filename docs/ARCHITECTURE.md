# ReWatch Architecture

## Overview

ReWatch is a Chrome extension born out of a personal need. As someone who watches content across multiple streaming platforms, I often found myself losing track of where I left off on different shows and movies. I searched for a complete solution but never found one that worked across all major platforms, respected privacy, and was easy to use. So, I built ReWatch to solve my own problem and decided to share it freely with others who might find it useful.

## Component Architecture

```text
ReWatch/
├─ manifest.json          # Chrome extension manifest (MV3)
├─ background.js          # Service worker: storage orchestration & deduplication
├─ content/               # Modular content scripts (core helpers, detectors, tracker)
│  ├─ core/               # Shared namespace, logging, DOM helpers, registry
│  ├─ platform-detectors/ # One detector per streaming service
│  └─ video-tracker/      # Runtime that wires detectors to storage messaging
├─ popup.html             # Popup layout
├─ popup.css              # Popup styles
├─ popup.js              # Popup logic (filters, export, open/delete actions)
├─ icons/                # Extension icons (16/32/48/128 px)
├─ docs/                 # Project documentation and marketing copy
├─ tests__/            # Jest-based automated tests (background worker)
├─ package.json          # Node tooling configuration (Jest scripts, deps)
├─ .gitignore            # Source-control hygiene rules
```

## Sequence Diagrams

### 1. Video Progress Tracking Flow

```mermaid
sequenceDiagram
    participant U as User
    participant CS as Content Script
    participant D as Platform Detector
    participant T as Video Tracker
    participant SW as Service Worker
    participant S as Chrome Storage

    U->>CS: Visits streaming site
    CS->>D: Initialize detector
    D->>CS: Register video element
    CS->>T: Attach tracker
    
    loop Every 5 seconds
        T->>D: Get metadata
        D-->>T: Return title, progress
        T->>SW: Send progress update
        SW->>S: Store progress
    end

    Note over SW,S: Deduplicates entries<br/>Prunes old data
```

### 2. Resume Flow

```mermaid
sequenceDiagram
    participant U as User
    participant P as Popup UI
    participant S as Chrome Storage
    participant CS as Content Script
    participant V as Video Player

    U->>P: Opens extension popup
    P->>S: Load watch history
    S-->>P: Return stored data
    P->>U: Display progress list
    U->>P: Click resume
    P->>CS: Navigate to timestamp
    CS->>V: Set video position
```

### 3. Cross-Platform Detection

```mermaid
sequenceDiagram
    participant CS as Content Script
    participant R as Platform Registry
    participant D as Platform Detector
    participant V as Video Element

    CS->>R: Get detector for domain
    R-->>CS: Return platform-specific detector
    CS->>D: Initialize detector
    D->>V: Attach observers
    V-->>D: Video events (play/pause/seek)
    D->>CS: Normalized video metadata
```

## Component Roles

- **Content Scripts**: Loaded on supported streaming platforms, detect and track HTML5 `<video>` playback, extract metadata, and send updates.
- **Background Service Worker**: Centralizes all progress, deduplicates history, cleans up completed items, manages persistent storage.
- **Popup UI**: Surfaces tracked history, allows resuming/opening/deleting entries, supports filtering and exporting data.
- **Platform Detectors**: Service-specific logic for Netflix, Disney+, HBO Max, etc.
- **Local Storage**: All data stored in Chrome Storage API, nothing leaves the user's device.

## Key Features

- Privacy-focused with all data stored locally
- Efficient updates with 5-second intervals
- Smart deduplication of series episodes
- Clean separation between platform-specific and core logic
- Export functionality for data backup
- Automatic cleanup of old completed items

The architecture ensures privacy by keeping all data local while providing a seamless experience across different streaming platforms.