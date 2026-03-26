# StreamBOSS | YouTube Shorts Automation (RE-Publis v3.0.0)

Professional mass video publishing automation for YouTube Shorts with AI-driven metadata and smart scheduling.

## 🚀 Quick Start (Running on a new PC)

Follow these steps to set up the environment on any Windows/Mac/Linux machine:

### 1. Requirements
- **Node.js (v18.0 or higher)**: Download from [nodejs.org](https://nodejs.org/).
- **Chrome / Edge Browser**: Required for initial YouTube account authorization.
- **Internet Connection**: Required for AI processing and video uploads.

### 2. Installation
1. Copy this project folder to your new PC.
2. Open **PowerShell** or **Command Prompt** inside this folder.
3. Run the following command to install all dependencies:
   ```bash
   npm install
   ```
   *Note: This will automatically download the correct FFmpeg binary for your system.*

### 3. Execution
To start the server, run:
```bash
node src/app.js
```


```
chmod +x setup-tunnel.sh
./setup-tunnel.sh
```

Open your browser and go to: `http://localhost:3005`

---

## 🛠️ Key Features
- **Smart Date-Range Distribution**: Spread videos evenly across multiple days.
- **AI Metadata Engine**: Automatic title, description, and hashtags via Google Gemini or Groq.
- **Dynamic YouTube Category**: Choose a category for each batch to optimize SEO.
- **Live System Monitor**: Real-time CPU, RAM, and Storage tracking (Drive D: focus).
- **Auto Cleanup**: Automatically deletes large rendered/thumbnail files after successful upload.
- **No Manual FFmpeg Needed**: Uses `ffmpeg-static` binaries included in the package.

## 📁 Project Structure
- `publis/[channelId]/videos`: Your master video source (Shorts).
- `publis/[channelId]/audios`: Audio pool for randomization.
- `publis/[channelId]/images`: Thumbnails gallery.
- `data/`: Database files (Accounts, Settings, Schedules).
- `src/`: Core logic and backend code.

---
**Warning**: Never share your `data/accounts.json` as it contains your unique YouTube access tokens.
