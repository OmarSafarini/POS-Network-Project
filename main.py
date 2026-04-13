"""
Smart POS Admin Dashboard — FastAPI Backend
============================================

HOW DATA FLOWS
──────────────
  1. Cashier submits products via  POST /api/products
  2. Each product is converted into a real transaction appended to TRANSACTIONS[]
  3. Fraud detection re-runs on the full list automatically
  4. Every dashboard endpoint reads TRANSACTIONS[], so ALL pages update at once

Endpoints
─────────
  POST /api/auth/login              → JWT login  (admin / admin123)
  GET  /api/sales                   → Overview stats (daily/weekly/monthly + cashier count)
  GET  /api/transactions            → Paginated list, filterable by branch & type
  GET  /api/fraud                   → Flagged transactions + alert messages
  GET  /api/branches                → Per-branch sales, counts, cashier sub-totals
  GET  /api/charts/sales-over-time  → 14-day line chart (includes cashier days)
  GET  /api/charts/branch-breakdown → Per-branch bar chart data
  POST /api/products                → Cashier submits a batch (PUBLIC — no JWT)
  GET  /api/products                → Admin views all batches  (JWT required)

Run
───
  pip install fastapi uvicorn pyjwt pydantic
  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import hashlib
import math
import random
import statistics
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
import jwt as pyjwt


# ══════════════════════════════════════════════════════════════════════
# APP SETUP
# ══════════════════════════════════════════════════════════════════════

app = FastAPI(title="Smart POS API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════

JWT_SECRET        = "pos-dashboard-secret-key-change-in-production"
JWT_ALGORITHM     = "HS256"
JWT_EXPIRY_HOURS  = 24

ADMIN_USER      = "admin"
ADMIN_PASS_HASH = hashlib.sha256("admin123".encode()).hexdigest()

# ── Fraud thresholds ─────────────────────────────────────────────────
FRAUD_HIGH_AMOUNT_MULTIPLIER = 3.0  # flag if amount > mean + 3× spread
FRAUD_RAPID_WINDOW_MINUTES   = 5    # window for rapid-fire check
FRAUD_RAPID_THRESHOLD        = 4    # max submissions in that window
FRAUD_REPEAT_THRESHOLD       = 3    # max identical amounts from same source


# ══════════════════════════════════════════════════════════════════════
# BRANCHES
# Referenced by seeded data and live cashier submissions.
# ══════════════════════════════════════════════════════════════════════

BRANCHES = [
    {"id": "BR-001", "name": "Downtown Central",  "city": "New York",      "status": "active"},
    {"id": "BR-002", "name": "Airport Terminal",   "city": "New York",      "status": "active"},
    {"id": "BR-003", "name": "Mall of Commerce",   "city": "Chicago",       "status": "active"},
    {"id": "BR-004", "name": "Suburb East",        "city": "Chicago",       "status": "active"},
    {"id": "BR-005", "name": "Harbor Point",       "city": "San Francisco", "status": "active"},
    {"id": "BR-006", "name": "Old Town Plaza",     "city": "Boston",        "status": "inactive"},
    {"id": "BR-007", "name": "Tech Park",          "city": "Austin",        "status": "active"},
    {"id": "BR-008", "name": "Riverside Station",  "city": "Portland",      "status": "active"},
]
BRANCH_MAP = {b["id"]: b for b in BRANCHES}   # fast lookup by id


# ══════════════════════════════════════════════════════════════════════
# SEED DATA  (historical background transactions)
# ══════════════════════════════════════════════════════════════════════

PAYMENT_METHODS = ["credit_card", "debit_card", "cash", "mobile_pay", "contactless"]
CARD_SOURCES    = [f"CARD-{i:04d}" for i in range(1, 31)]

random.seed(42)

# Fixed reference clock for seed data.
# Cashier submissions use datetime.utcnow() (real time ≈ April 9 2026),
# which naturally falls inside the daily/weekly windows below.
SEED_NOW = datetime(2026, 4, 7, 15, 0, 0)


def _generate_seed_transactions(count: int = 500) -> list[dict]:
    txns = []
    for i in range(count):
        ts     = SEED_NOW - timedelta(minutes=random.randint(0, 43200))
        branch = random.choice(BRANCHES)
        amount = round(
            random.uniform(800, 5000) if random.random() < 0.04
            else random.uniform(5, 300),
            2,
        )
        txns.append({
            "id":             f"TXN-{i+1:05d}",
            "branch_id":      branch["id"],
            "branch_name":    branch["name"],
            "amount":         amount,
            "time":           ts.isoformat(),
            "payment_method": random.choice(PAYMENT_METHODS),
            "source":         random.choice(CARD_SOURCES),
            "product_name":   None,
            "type":           "pos",
            "batch_id":       None,
        })

    # Rapid-fire fraud cluster (Rule 2)
    fb = BRANCHES[1]
    bt = SEED_NOW - timedelta(hours=2)
    for j in range(6):
        txns.append({
            "id": f"TXN-F{j+1:03d}", "branch_id": fb["id"], "branch_name": fb["name"],
            "amount": 245.00, "time": (bt + timedelta(minutes=j)).isoformat(),
            "payment_method": "credit_card", "source": "CARD-9999",
            "product_name": None, "type": "pos", "batch_id": None,
        })

    # Repeated-amount fraud (Rule 3)
    rb = BRANCHES[4]
    for j in range(5):
        txns.append({
            "id": f"TXN-R{j+1:03d}", "branch_id": rb["id"], "branch_name": rb["name"],
            "amount": 999.99,
            "time": (SEED_NOW - timedelta(hours=random.randint(1, 48))).isoformat(),
            "payment_method": "debit_card", "source": "CARD-8888",
            "product_name": None, "type": "pos", "batch_id": None,
        })

    txns.sort(key=lambda t: t["time"], reverse=True)
    return txns


# ── Shared live data stores ───────────────────────────────────────────
# All endpoints read from TRANSACTIONS.  submit_products() appends to it
# and re-runs fraud detection so every page sees the update immediately.

TRANSACTIONS: list[dict]  = _generate_seed_transactions()
PRODUCT_BATCHES: list[dict] = []
_cashier_txn_counter: int   = 0


# ══════════════════════════════════════════════════════════════════════
# FRAUD DETECTION ENGINE
# Re-runs every time the cashier submits a batch.
# ══════════════════════════════════════════════════════════════════════

def _detect_fraud(txns: list[dict]) -> tuple[list[dict], set[str]]:
    if not txns:
        return [], set()

    amounts       = [t["amount"] for t in txns]
    avg           = statistics.mean(amounts)
    std           = statistics.stdev(amounts) if len(amounts) > 1 else 0
    high_thresh   = avg + FRAUD_HIGH_AMOUNT_MULTIPLIER * max(std, avg * 0.5)

    by_source: dict[str, list[dict]] = defaultdict(list)
    for t in txns:
        by_source[t["source"]].append(t)

    flagged: dict[str, dict] = {}

    for t in txns:
        reasons: list[str] = []

        # Rule 1 — high amount
        if t["amount"] > high_thresh:
            reasons.append(f"High amount (${t['amount']:.2f} vs avg ${avg:.2f})")

        # Rule 2 — rapid-fire from same source
        src_txns = by_source[t["source"]]
        t_dt     = datetime.fromisoformat(t["time"])
        nearby   = [
            s for s in src_txns
            if s["id"] != t["id"]
            and abs((datetime.fromisoformat(s["time"]) - t_dt).total_seconds())
               < FRAUD_RAPID_WINDOW_MINUTES * 60
        ]
        if len(nearby) >= FRAUD_RAPID_THRESHOLD - 1:
            reasons.append(
                f"Rapid-fire: {len(nearby)+1} txns within {FRAUD_RAPID_WINDOW_MINUTES} min"
            )

        # Rule 3 — repeated exact amount from same source
        same = [s for s in src_txns if s["amount"] == t["amount"] and s["id"] != t["id"]]
        if len(same) >= FRAUD_REPEAT_THRESHOLD - 1:
            reasons.append(
                f"Repeated amount (${t['amount']:.2f}) ×{len(same)+1} from {t['source']}"
            )

        if reasons:
            flagged[t["id"]] = {**t, "reasons": reasons,
                                 "risk_score": min(len(reasons) * 35, 100)}

    results = sorted(flagged.values(), key=lambda x: x["risk_score"], reverse=True)
    return results, {f["id"] for f in results}


FRAUD_RESULTS, FRAUD_IDS = _detect_fraud(TRANSACTIONS)


# ══════════════════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    username: str
    password: str


security = HTTPBearer()


def _create_token(username: str) -> str:
    return pyjwt.encode(
        {"sub": username,
         "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
         "iat": datetime.utcnow()},
        JWT_SECRET, algorithm=JWT_ALGORITHM,
    )


def _verify_token(creds: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        return pyjwt.decode(
            creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM]
        )["sub"]
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


@app.post("/api/auth/login")
def login(body: LoginRequest):
    if body.username != ADMIN_USER or \
       hashlib.sha256(body.password.encode()).hexdigest() != ADMIN_PASS_HASH:
        raise HTTPException(401, "Invalid credentials")
    return {"token": _create_token(body.username), "username": body.username}


# ══════════════════════════════════════════════════════════════════════
# OVERVIEW  GET /api/sales
# Summary cards: daily/weekly/monthly totals, cashier activity today,
# active branches, fraud flag count.
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/sales")
def get_sales(_user: str = Depends(_verify_token)):
    day_ago         = (SEED_NOW - timedelta(days=1)).isoformat()
    week_ago        = (SEED_NOW - timedelta(days=7)).isoformat()
    month_ago       = (SEED_NOW - timedelta(days=30)).isoformat()
    prev_day_start  = (SEED_NOW - timedelta(days=2)).isoformat()
    prev_week_start = (SEED_NOW - timedelta(days=14)).isoformat()

    daily   = sum(t["amount"] for t in TRANSACTIONS if t["time"] >= day_ago)
    weekly  = sum(t["amount"] for t in TRANSACTIONS if t["time"] >= week_ago)
    monthly = sum(t["amount"] for t in TRANSACTIONS if t["time"] >= month_ago)

    prev_daily  = sum(t["amount"] for t in TRANSACTIONS
                      if prev_day_start <= t["time"] < day_ago)
    prev_weekly = sum(t["amount"] for t in TRANSACTIONS
                      if prev_week_start <= t["time"] < week_ago)

    def pct(cur: float, prev: float) -> float:
        return round(((cur - prev) / prev) * 100, 1) if prev else 0.0

    cashier_today = sum(
        1 for t in TRANSACTIONS if t["type"] == "cashier" and t["time"] >= day_ago
    )

    return {
        "daily":              {"total": round(daily, 2),   "change_pct": pct(daily, prev_daily)},
        "weekly":             {"total": round(weekly, 2),   "change_pct": pct(weekly, prev_weekly)},
        "monthly":            {"total": round(monthly, 2),  "change_pct": 0},
        "total_transactions": len(TRANSACTIONS),
        "active_branches":    sum(1 for b in BRANCHES if b["status"] == "active"),
        "cashier_today":      cashier_today,
        "total_flagged":      len(FRAUD_IDS),
    }


# ══════════════════════════════════════════════════════════════════════
# TRANSACTIONS  GET /api/transactions
# Full list: seeded POS + live cashier, paginated.
# Filterable by branch_id and by type ("pos" | "cashier").
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/transactions")
def get_transactions(
    page:        int           = Query(1, ge=1),
    per_page:    int           = Query(25, ge=1, le=100),
    branch_id:   Optional[str] = None,
    type_filter: Optional[str] = Query(None, alias="type"),
    _user: str                 = Depends(_verify_token),
):
    filtered = TRANSACTIONS

    if branch_id:
        filtered = [t for t in filtered if t["branch_id"] == branch_id]

    if type_filter in ("pos", "cashier"):
        filtered = [t for t in filtered if t["type"] == type_filter]

    total = len(filtered)
    start = (page - 1) * per_page
    items = filtered[start: start + per_page]

    return {
        "items":    [{**t, "suspicious": t["id"] in FRAUD_IDS} for t in items],
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "pages":    math.ceil(total / per_page) if total else 1,
    }


# ══════════════════════════════════════════════════════════════════════
# FRAUD  GET /api/fraud
# FRAUD_RESULTS is updated by submit_products() after each cashier batch.
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/fraud")
def get_fraud(_user: str = Depends(_verify_token)):
    alerts = []
    for f in FRAUD_RESULTS[:20]:
        for reason in f["reasons"]:
            alerts.append({
                "id":             str(uuid.uuid4())[:8],
                "transaction_id": f["id"],
                "branch_name":    f["branch_name"],
                "amount":         f["amount"],
                "time":           f["time"],
                "message":        reason,
                "risk_score":     f["risk_score"],
                "type":           f.get("type", "pos"),
            })

    return {
        "suspicious_transactions": FRAUD_RESULTS[:30],
        "alerts":                  alerts[:30],
        "total_flagged":           len(FRAUD_RESULTS),
    }


# ══════════════════════════════════════════════════════════════════════
# BRANCHES  GET /api/branches
# Includes cashier_count per branch so the Branches page can show a
# breakdown of how many cashier items were submitted per location.
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/branches")
def get_branches(_user: str = Depends(_verify_token)):
    result = []
    for b in BRANCHES:
        b_txns  = [t for t in TRANSACTIONS if t["branch_id"] == b["id"]]
        flagged = sum(1 for t in b_txns if t["id"] in FRAUD_IDS)
        result.append({
            **b,
            "total_sales":       round(sum(t["amount"] for t in b_txns), 2),
            "transaction_count": len(b_txns),
            "cashier_count":     sum(1 for t in b_txns if t["type"] == "cashier"),
            "flagged_count":     flagged,
        })
    result.sort(key=lambda x: x["total_sales"], reverse=True)
    return {"branches": result}


# ══════════════════════════════════════════════════════════════════════
# ANALYTICS  GET /api/charts/*
# Both endpoints read from TRANSACTIONS — cashier data included.
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/charts/sales-over-time")
def chart_sales_over_time(_user: str = Depends(_verify_token)):
    """14-day daily sales line chart. Extends to today if cashier data exists."""
    buckets: dict[str, float] = {}
    for i in range(14):
        buckets[(SEED_NOW - timedelta(days=13 - i)).strftime("%Y-%m-%d")] = 0.0

    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    if today_str not in buckets:
        buckets[today_str] = 0.0

    for t in TRANSACTIONS:
        day = t["time"][:10]
        if day in buckets:
            buckets[day] += t["amount"]

    sorted_b = dict(sorted(buckets.items()))
    return {
        "labels": list(sorted_b.keys()),
        "values": [round(v, 2) for v in sorted_b.values()],
    }


@app.get("/api/charts/branch-breakdown")
def chart_branch_breakdown(_user: str = Depends(_verify_token)):
    """Per-branch sales and counts, including a cashier_count column."""
    sales:   dict[str, float] = defaultdict(float)
    counts:  dict[str, int]   = defaultdict(int)
    cashier: dict[str, int]   = defaultdict(int)
    names:   dict[str, str]   = {}

    for t in TRANSACTIONS:
        sales[t["branch_id"]]  += t["amount"]
        counts[t["branch_id"]] += 1
        names[t["branch_id"]]   = t["branch_name"]
        if t["type"] == "cashier":
            cashier[t["branch_id"]] += 1

    data = [
        {"branch_id": bid, "name": names[bid],
         "sales": round(sales[bid], 2),
         "transactions": counts[bid],
         "cashier_count": cashier[bid]}
        for bid in sorted(sales.keys())
    ]
    return {"branches": data}


# ══════════════════════════════════════════════════════════════════════
# CASHIER PRODUCTS
#
# POST /api/products  — PUBLIC (cashier page, no JWT needed)
#   • Stores the product batch
#   • Converts every product → transaction → appends to TRANSACTIONS
#   • Re-runs fraud detection so all pages update immediately
#
# GET  /api/products  — PROTECTED (admin dashboard, JWT required)
#   • Returns all stored batches newest-first with summary totals
# ══════════════════════════════════════════════════════════════════════

class ProductItem(BaseModel):
    name:  str
    price: float


class ProductBatchRequest(BaseModel):
    products:     list[ProductItem]
    cashier_note: str = ""
    branch_id:    str = "UNKNOWN"


@app.post("/api/products")
def submit_products(body: ProductBatchRequest):
    """
    THE INTEGRATION HUB.

    Step 1 — Store the raw batch (so the Products page can show it).
    Step 2 — For each product, create a proper transaction in TRANSACTIONS.
             This makes it visible on Overview, Transactions, Branches,
             Fraud, Alerts, and Analytics pages.
    Step 3 — Re-run fraud detection on the whole TRANSACTIONS list.
             All endpoints that serve fraud/alerts data will reflect the
             new results immediately on the next request.
    """
    global _cashier_txn_counter, FRAUD_RESULTS, FRAUD_IDS

    if not body.products:
        raise HTTPException(400, "No products provided")

    branch      = BRANCH_MAP.get(body.branch_id)
    branch_name = branch["name"] if branch else body.branch_id
    batch_id    = f"BATCH-{str(uuid.uuid4())[:8].upper()}"
    submit_ts   = datetime.utcnow()

    # ── Step 1: store raw batch ───────────────────────────────────────
    PRODUCT_BATCHES.append({
        "batch_id":     batch_id,
        "branch_id":    body.branch_id,
        "branch_name":  branch_name,
        "products":     [{"name": p.name, "price": p.price} for p in body.products],
        "cashier_note": body.cashier_note,
        "submitted_at": submit_ts.isoformat(),
        "total":        round(sum(p.price for p in body.products), 2),
        "count":        len(body.products),
    })

    # ── Step 2: convert each product into a live transaction ──────────
    for k, product in enumerate(body.products):
        _cashier_txn_counter += 1
        TRANSACTIONS.insert(0, {
            "id":             f"TXN-CSH-{_cashier_txn_counter:05d}",
            "branch_id":      body.branch_id,
            "branch_name":    branch_name,
            "amount":         round(product.price, 2),
            "time":           (submit_ts + timedelta(seconds=k)).isoformat(),
            "payment_method": "cashier",   # shown as its own badge in the frontend
            "source":         batch_id,    # same source = fraud rules can fire
            "product_name":   product.name,
            "type":           "cashier",
            "batch_id":       batch_id,
        })

    # ── Step 3: refresh fraud detection ──────────────────────────────
    FRAUD_RESULTS, FRAUD_IDS = _detect_fraud(TRANSACTIONS)

    return {
        "batch_id": batch_id,
        "status":   "received",
        "count":    len(body.products),
        "total":    round(sum(p.price for p in body.products), 2),
    }


@app.get("/api/products")
def get_products(_user: str = Depends(_verify_token)):
    return {
        "batches":        list(reversed(PRODUCT_BATCHES)),
        "total_batches":  len(PRODUCT_BATCHES),
        "total_products": sum(b["count"] for b in PRODUCT_BATCHES),
        "grand_total":    round(sum(b["total"] for b in PRODUCT_BATCHES), 2),
    }
