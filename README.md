# Smart POS — Admin Dashboard

A full-stack admin dashboard for a multi-branch Smart POS system with real-time monitoring, fraud detection, JWT authentication, and analytics.

## Project Structure

```
pos-dashboard/
├── backend/
│   ├── main.py              ← FastAPI app (all endpoints + fraud engine)
│   └── requirements.txt
├── frontend/
│   ├── index.html           ← Standalone HTML dashboard (no build needed)
│   └── Dashboard.jsx        ← React component version (for React projects)
└── README.md
```

## Quick Start

### 1. Start the Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Verify: http://localhost:8000/docs (Swagger UI)

### 2. Open the Frontend

Open `frontend/index.html` in your browser. That's it — no npm, no build step.

### 3. Login

- **Username:** `admin`
- **Password:** `admin123`

## Features

### Dashboard Overview
- Daily, weekly, monthly sales with period-over-period change
- Total transaction count and active branch count
- Line chart (sales over 14 days) and bar chart (per-branch breakdown)
- Fraud alert summary

### Branch Monitoring
- 8 branches across US cities
- Per-branch: total sales, transaction count, flagged transactions
- Active/inactive status indicators

### Transaction History
- Paginated table (20 per page) with 500+ transactions
- Fields: ID, branch, amount, time, payment method, status
- Suspicious transactions highlighted in red
- Payment method badges (Credit, Debit, Cash, Mobile, Tap)

### Fraud Detection System
Three-rule engine:
1. **High Amount** — flags if amount > 3× standard deviation above average
2. **Rapid-Fire** — flags if 4+ transactions from same source within 5 minutes
3. **Repeat Amount** — flags if 3+ identical amounts from same source

Each flagged transaction shows:
- Risk score (0-100%)
- All triggered rule reasons
- Visual risk bar

### Alert Center
- Human-readable alert messages with risk scores
- Linked to transaction ID, branch, amount, and time
- Color-coded by severity (red for high risk, amber for medium)

### Analytics
- SVG line chart: 14-day sales trend
- Bar charts: transactions and revenue per branch

### Security
- JWT authentication (24-hour expiry)
- All API endpoints protected (except login)
- Token auto-refresh simulation every 30 seconds

### Dark Mode
- Toggle between dark and light themes
- Full theme support across all components

## API Endpoints

| Method | Endpoint                       | Auth | Description                     |
|--------|--------------------------------|------|---------------------------------|
| POST   | `/api/auth/login`              | No   | Returns JWT token               |
| GET    | `/api/sales`                   | Yes  | Sales summary (daily/weekly/mo) |
| GET    | `/api/transactions`            | Yes  | Paginated transactions          |
| GET    | `/api/fraud`                   | Yes  | Flagged transactions + alerts   |
| GET    | `/api/branches`                | Yes  | Branch list with stats          |
| GET    | `/api/charts/sales-over-time`  | Yes  | 14-day line chart data          |
| GET    | `/api/charts/branch-breakdown` | Yes  | Per-branch bar chart data       |

### Query Parameters (Transactions)

- `page` (int, default 1)
- `per_page` (int, default 25, max 100)
- `branch_id` (string, optional filter)

## Tech Stack

- **Backend:** Python 3.10+, FastAPI, PyJWT, Pydantic
- **Frontend:** HTML, Tailwind CSS (CDN), vanilla JavaScript
- **Auth:** JWT (HS256)
- **React version:** `Dashboard.jsx` included for React integration

## PostgreSQL Integration (Optional)

The app ships with in-memory seeded data for instant setup. To connect PostgreSQL:

1. Install: `pip install asyncpg sqlalchemy[asyncio]`
2. Replace the `TRANSACTIONS` list with SQLAlchemy models
3. Add async database sessions to each endpoint
4. Run Alembic migrations for schema management

The API response shapes remain identical — the frontend requires no changes.
