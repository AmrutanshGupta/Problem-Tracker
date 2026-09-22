# 🚀 Problem Tracker (v2.0)

**Track Every Problem. Forget Nothing.**

An offline-first Chrome extension that bookmarks and schedules your competitive programming practice across **LeetCode**, **Codeforces**, **CSES**, and **AtCoder** — so patterns stick instead of slipping away. 

Problem Tracker is a full-stack, distributed application built to demonstrate robust **System Design** principles, including advanced caching strategies, simulated materialized views, event sourcing, and offline-first client architecture.

---

## 🧠 System Design & Architecture Highlights

This project was intentionally engineered to handle scale and demonstrate production-grade backend patterns:

### 1. Advanced Analytics & "Materialized Views"
To generate GitHub-style contribution graphs and study streaks without melting the database:
*   **Immutable Event Log**: Every action a user takes (bookmarking, reviewing) is appended to an immutable `event_log` table.
*   **Background Aggregation**: A background asynchronous worker (`backend/app/analytics/jobs.py`) runs periodically to crunch the raw event data.
*   **Materialized View Simulation**: The background worker upserts aggregated data into a read-optimized `user_daily_activity` table. The frontend queries this pre-computed table, reducing an expensive `O(N)` analytical query into an instant `O(1)` fetch.

### 2. High-Performance Caching Strategy
To protect the database from heavy read loads (specifically the "Due Reviews" endpoint which users check constantly):
*   **In-Memory LRU Cache**: Implemented a TTL-based cache layer in Python (`CacheService`) that perfectly mimics a Redis cluster.
*   **Cache-Aside Pattern**: When a user requests their due reviews, the system checks the cache first. If a cache miss occurs, it queries PostgreSQL and writes to the cache.
*   **Write-Through Invalidation**: The exact moment a user completes or schedules a review, the backend explicitly invalidates their specific cache key, ensuring they never see stale data.

### 3. Offline-First Client Sync
*   **Service Workers & Storage**: If a user loses internet connection while reviewing problems, the Chrome extension intercepts network failures.
*   **Action Queuing**: Failed requests are stored locally in Chrome's storage API.
*   **Auto-Reconciliation**: Once the connection is restored, a background sync process automatically flushes the queue to the backend. No data is ever lost.

### 4. Spaced Repetition Algorithm (SM-2)
*   **Adaptive Scheduling**: Re-surfaces bookmarked problems at the exact interval your memory actually needs them.
*   **Algorithmic Growth**: The interval expands exponentially based on a dynamic `ease_factor`. If you rate a problem as "Hard" (quality < 3), the interval resets.

---

## 📁 Repository Structure (Monorepo)

```text
problem-tracker/
├── extension/       # The Chrome extension (UI, API Client, and Content Scripts)
├── backend/         # FastAPI, PostgreSQL, Alembic, Analytics Workers, and Caching
└── marketing-site/  # Next.js static portfolio landing page
```

---

## 🛠️ Getting Started Locally

### 1. Backend Setup (FastAPI)
The backend uses Python 3.11+. Locally, it safely defaults to SQLite so you don't need a running Postgres server.

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Apply the database schema
alembic upgrade head

# Start the server
uvicorn app.main:app --reload
```

### 2. Chrome Extension Setup
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** ON (top right corner).
3. Click **Load unpacked**.
4. Select the `extension/` folder from this repository.
5. *(Note: By default, `extension/lib/api-client.js` is pointed to the live production server. To test locally, change `API_BASE_URL` back to `http://localhost:8000`)*.

### 3. Marketing Site Setup (Next.js)
```bash
cd marketing-site
npm install
npm run dev
```

---

## ☁️ Deployment Architecture

This project is deployed using modern Infrastructure-as-Code (IaC) and CI/CD pipelines:

*   **Backend (Render)**: The `render.yaml` file automatically provisions a free PostgreSQL database and deploys the FastAPI web service via GitHub Webhooks. The `startCommand` dynamically runs Alembic migrations before booting Uvicorn to guarantee schema safety.
*   **Frontend (Vercel)**: The `marketing-site` is deployed on Vercel as an optimized static Next.js site.
*   **CI/CD Pipeline**: A GitHub Actions workflow (`.github/workflows/ci.yml`) automatically tests the backend (`pytest`) and verifies the Next.js build on every push to the `main` branch.

