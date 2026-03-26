# RE-Auto-Publisher Architecture Design

## 1. Overview
RE-Auto-Publisher is a web-based automation platform designed to streamline video content creation and publishing on YouTube. The system allows users to manage multiple Google accounts, schedule uploads, and automate the video rendering process by combining raw video/image assets with randomized audio tracks.

---

## 2. System Architecture Diagram

```mermaid
graph TD
    subgraph "Client (Frontend - React/Next.js)"
        UI["Dashboard & Control Panel"]
        AuthUI["Google Auth (OAuth2)"]
        MediaUI["Media Manager (Upload)"]
        SchedUI["Scheduler UI"]
    end

    subgraph "Server (Backend - Node.js)"
        API["REST API (Express)"]
        TokenMgr["Google Token Manager"]
        MediaMgr["Media & File Manager"]
        JobQueue["Job Queue (BullMQ/Redis)"]
    end

    subgraph "Worker Services"
        Renderer["Render Engine (FFmpeg)"]
        Uploader["YouTube Uploader (Google API)"]
        Cron["Task Scheduler (node-cron)"]
    end

    subgraph "Storage"
        DB[("Database (SQLite/PostgreSQL)")]
        FS["Local File System (Public Folder)"]
    end

    %% Relationships
    UI --> API
    API --> DB
    API --> FS
    API --> JobQueue
    
    JobQueue --> Renderer
    JobQueue --> Uploader
    Cron --> JobQueue
    
    TokenMgr --> Uploader
    TokenMgr --> DB
    
    Renderer --> FS
    Uploader --> Renderer
    Uploader --> "YouTube (Google API)"
```

---

## 3. File & Data Management

### Folder Structure
All media and transient data are stored in a centralized `data` directory:

```text
/data
├── public/                # Accessible via Web Server
│   ├── videos/            # Raw Video Assets
│   ├── audios/            # Raw Audio Assets
│   ├── images/            # Background Images (Pro Mode)
│   ├── overlays/          # Overlay assets (Watermarks, Greenscreens)
│   └── rendered/          # Final Rendered Videos (Ready for Upload)
├── credentials/           # OAuth2 Client Secrets & User Tokens
└── database/              # SQLite Database File
```

---

## 4. Key Components

### A. Google OAuth2 Authentication
- **Multi-Account Support**: Store separate credentials (client_id, client_secret) and access/refresh tokens for each user account.
- **Token Management**: The `Token Manager` handles automatic token refreshing before each upload.

### B. Rendering Engine (The "Merger" Logic)
- **Input**: Selects a video/image from the `/videos` or `/images` folder.
- **Audio Randomization**: Picks N songs from `/audios` folder, shuffles them (Fisher-Yates), and loops them if necessary to match the video length.
- **Normalization**: Automatically normalizes audio levels (Loudnorm) and sample rates (44100Hz) before merging.
- **Overlay Support**: Adds greenscreens or transparent overlays with randomized opacity/positioning.

### C. Scheduler & Multi-Account
- **Planning**: Users define a "Campaign" (Set of accounts + Set of media + Schedule).
- **Execution**: `node-cron` monitors the database. When a schedule is due, it triggers a `Render-then-Upload` job in the queue.
- **Parallelism**: Multiple rendering/uploading jobs can run concurrently based on system resources.

---

## 5. Technology Stack
- **Frontend**: Next.js 15+ (App Router), Vanilla CSS, SWR (Data Fetching).
- **Backend**: Node.js, Express, `bullmq` (Queue), `sqlite3` (Database).
- **Rendering**: `fluent-ffmpeg` + `ffmpeg-static`.
- **API**: `googleapis` (YouTube v3 API).

---

## 6. Implementation Strategy
1. **Initialize Project**: Set up Next.js and Express server.
2. **Auth Layer**: Implement Google OAuth2 flow for multi-account management.
3. **Media Management**: Create UI/API for folder-based media uploading.
4. **Rendering Module**: Port existing "Merger-Pro" FFmpeg logic to the backend.
5. **Scheduler**: Build the database schema for campaigns and jobs.
6. **Uploader**: Implement the YouTube upload service with metadata support.
