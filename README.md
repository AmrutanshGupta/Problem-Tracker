# Problem Tracker (v2.0)

Track Every Problem. Forget Nothing. 

An offline-first Chrome extension that bookmarks and schedules your competitive programming practice across **LeetCode**, **Codeforces**, **CSES**, and **AtCoder** — so patterns stick instead of slipping away. 

Problem Tracker v2.0 introduces a robust backend, cross-device sync, and intelligent spaced repetition to optimize your learning workflow.

## 🚀 Key Features

*   🔌 **Offline-First Architecture**: Solve anywhere, sync everywhere. A background service worker queues every action locally and syncs automatically the moment you're back online — no lost sessions, no re-tracking from scratch.
*   🧠 **Spaced Repetition (SM-2)**: Review right before you forget. An adaptive scheduler resurfaces bookmarked problems at the interval your memory actually needs, not a fixed one-size-fits-all reminder.
*   📸 **Code Snapshots**: Keep a paper trail of your thinking. Save the exact code behind any bookmarked problem directly from the supported platform's editor. Identical code attempts are deduplicated seamlessly.
*   🔒 **Secure & Isolated**: Built like production. JWT-backed auth and object-level authorization keep every user's data strictly isolated — the same pattern real SaaS backends run on.

## 📁 Repository Structure

This repository is a monorepo containing three distinct components:

```text
problem-tracker/
├── extension/       # The Chrome extension (UI and content scripts)
├── backend/         # FastAPI & Postgres backend (handles sync and SM-2 scheduling)
└── marketing-site/  # Next.js landing page advertising the extension
```

## 🛠️ Getting Started

### 1. Backend Setup

The backend handles cross-device synchronization, code storage, and review scheduling. It requires Python 3.11+ and PostgreSQL.

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run migrations (ensure your database is configured)
alembic upgrade head

# Start the development server
uvicorn app.main:app --reload
```

### 2. Chrome Extension Setup

The extension connects to the backend to sync your bookmarks, code snapshots, and review schedule.

1. Open Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** ON (in the top right corner).
3. Click the **Load unpacked** button.
4. Select the `extension/` folder from this repository.
5. Pin the extension to your Chrome toolbar. Click it to log in and access your review queue.

### 3. Marketing Site Setup (Optional)

If you'd like to run the static Next.js landing page:

```bash
cd marketing-site
npm install
npm run dev
```
Open `http://localhost:3000` to view the page.

## 🧪 Testing

The backend includes a comprehensive `pytest` suite that verifies API endpoints, SM-2 scheduling math, and object-level data isolation.

```bash
cd backend
pytest
```

## ☁️ Deployment

*   **Backend**: Included `render.yaml` supports automated Infrastructure-as-Code deployment to Render as a Web Service + PostgreSQL database.
*   **Marketing Site**: Ready to be deployed as a static site on Vercel. 
*   **CI/CD**: A GitHub Actions workflow (`.github/workflows/ci.yml`) automatically tests the backend and builds the marketing site on every push to `main`.