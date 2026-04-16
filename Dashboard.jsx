import { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/* ═══════════════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════════════ */
const API = "http://localhost:8000/api";

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */
const usd      = (n) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:0,maximumFractionDigits:0}).format(n);
const usd2     = (n) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
const pct      = (n) => (n > 0 ? "+" : "") + n.toFixed(1) + "%";
const shortDate = (iso) => new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric"});
const shortTime = (iso) => new Date(iso).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
const cls      = (...args) => args.filter(Boolean).join(" ");

/* ═══════════════════════════════════════════════════════════════════
   ICONS (inline SVG)
   ═══════════════════════════════════════════════════════════════════ */
const Icon = ({ d, className = "w-5 h-5", stroke = true }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
    fill={stroke ? "none" : "currentColor"}
    stroke={stroke ? "currentColor" : "none"}
    strokeWidth={stroke ? 1.75 : 0}
    strokeLinecap="round" strokeLinejoin="round"
    className={className}>
    <path d={d} />
  </svg>
);

const icons = {
  dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1",
  branch:    "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5",
  txn:       "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  fraud:     "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  alerts:    "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  sun:       "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
  moon:      "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z",
  logout:    "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  lock:      "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  chart:     "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  chevL:     "M15 19l-7-7 7-7",
  chevR:     "M9 5l7 7-7 7",
  refresh:   "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  products:  "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
};


/* ═══════════════════════════════════════════════════════════════════
   API LAYER
   ═══════════════════════════════════════════════════════════════════ */
async function apiFetch(path, token, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}


/* ═══════════════════════════════════════════════════════════════════
   LOGIN SCREEN
   ═══════════════════════════════════════════════════════════════════ */
function LoginScreen({ onLogin, dark }) {
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("admin123");
  const [err, setErr]   = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const data = await apiFetch("/auth/login", null, {
        method: "POST",
        body: JSON.stringify({ username: user, password: pass }),
      });
      onLogin(data.token, data.username);
    } catch {
      setErr("Invalid credentials or server unreachable");
    } finally { setLoading(false); }
  };

  return (
    <div className={cls("min-h-screen flex items-center justify-center px-4 transition-colors duration-300",
      dark ? "bg-[#0a0e17]" : "bg-slate-100")}>
      <div className={cls("w-full max-w-sm rounded-2xl p-8 shadow-2xl border transition-colors",
        dark ? "bg-[#111827] border-white/5" : "bg-white border-slate-200")}>
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl mb-4 bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/25">
            P
          </div>
          <h1 className={cls("text-xl font-bold", dark ? "text-white" : "text-slate-900")}>Smart POS</h1>
          <p className={cls("text-sm mt-1", dark ? "text-slate-500" : "text-slate-400")}>Admin Dashboard Login</p>
        </div>
        {err && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg px-4 py-2.5 mb-4">{err}</div>}
        <div className="flex flex-col gap-4">
          <div>
            <label className={cls("text-xs font-semibold uppercase tracking-wider mb-1.5 block",
              dark ? "text-slate-400" : "text-slate-500")}>Username</label>
            <input value={user} onChange={e => setUser(e.target.value)}
              className={cls("w-full rounded-lg px-4 py-2.5 text-sm outline-none border transition-colors",
                dark ? "bg-white/5 border-white/10 text-white focus:border-teal-500"
                     : "bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500")} />
          </div>
          <div>
            <label className={cls("text-xs font-semibold uppercase tracking-wider mb-1.5 block",
              dark ? "text-slate-400" : "text-slate-500")}>Password</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit(e)}
              className={cls("w-full rounded-lg px-4 py-2.5 text-sm outline-none border transition-colors",
                dark ? "bg-white/5 border-white/10 text-white focus:border-teal-500"
                     : "bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500")} />
          </div>
          <button onClick={submit} disabled={loading}
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold text-sm rounded-lg px-4 py-2.5 mt-2 hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-teal-500/20">
            {loading ? "Signing in…" : "Sign In"}
          </button>
          <p className={cls("text-xs text-center mt-2", dark ? "text-slate-600" : "text-slate-400")}>
            Default: admin / admin123
          </p>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   SIDEBAR
   ═══════════════════════════════════════════════════════════════════ */
const NAV = [
  { id: "overview",  label: "Overview",         icon: icons.dashboard },
  { id: "branches",  label: "Branches",         icon: icons.branch },
  { id: "txns",      label: "Transactions",     icon: icons.txn },
  { id: "fraud",     label: "Fraud Detection",  icon: icons.fraud },
  { id: "alerts",    label: "Alerts",           icon: icons.alerts },
  { id: "charts",    label: "Analytics",        icon: icons.chart },
  { id: "products",  label: "Cashier Products", icon: icons.products },
];

function Sidebar({ active, onChange, dark, onToggleDark, onLogout, collapsed, onCollapse, fraudCount }) {
  return (
    <aside className={cls(
      "fixed top-0 left-0 h-screen flex flex-col border-r z-30 transition-all duration-300",
      collapsed ? "w-[68px]" : "w-60",
      dark ? "bg-[#0d1117] border-white/5" : "bg-white border-slate-200"
    )}>
      {/* Logo */}
      <div className={cls("flex items-center gap-3 px-4 h-16 border-b shrink-0",
        dark ? "border-white/5" : "border-slate-100")}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-black text-sm shrink-0 shadow-lg shadow-teal-500/20">
          P
        </div>
        {!collapsed && <span className={cls("font-bold text-sm tracking-tight", dark ? "text-white" : "text-slate-900")}>Smart POS</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        {NAV.map(n => (
          <button key={n.id} onClick={() => onChange(n.id)}
            className={cls(
              "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all mb-0.5",
              active === n.id
                ? dark ? "bg-teal-500/10 text-teal-400" : "bg-teal-50 text-teal-700"
                : dark ? "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                       : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            )}>
            <Icon d={n.icon} className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="truncate">{n.label}</span>}
            {/* Fraud badge */}
            {n.id === "fraud" && !collapsed && fraudCount > 0 && (
              <span className="ml-auto text-[10px] font-bold bg-red-500/20 text-red-400 rounded-full px-2 py-0.5">
                {fraudCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className={cls("border-t px-2 py-3 flex flex-col gap-1 shrink-0",
        dark ? "border-white/5" : "border-slate-100")}>
        <button onClick={onCollapse}
          className={cls("w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
            dark ? "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                 : "text-slate-400 hover:text-slate-600 hover:bg-slate-50")}>
          <Icon d={collapsed ? icons.chevR : icons.chevL} className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Collapse</span>}
        </button>
        <button onClick={onToggleDark}
          className={cls("w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
            dark ? "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                 : "text-slate-400 hover:text-slate-600 hover:bg-slate-50")}>
          <Icon d={dark ? icons.sun : icons.moon} className="w-4 h-4 shrink-0" />
          {!collapsed && <span>{dark ? "Light mode" : "Dark mode"}</span>}
        </button>
        <button onClick={onLogout}
          className={cls("w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
            dark ? "text-slate-500 hover:text-red-400 hover:bg-red-500/5"
                 : "text-slate-400 hover:text-red-500 hover:bg-red-50")}>
          <Icon d={icons.logout} className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   STAT CARD
   ═══════════════════════════════════════════════════════════════════ */
function StatCard({ label, value, change, icon, color, dark }) {
  const colors = {
    teal:   { bg: dark ? "bg-teal-500/10"   : "bg-teal-50",   text: "text-teal-500" },
    blue:   { bg: dark ? "bg-blue-500/10"   : "bg-blue-50",   text: "text-blue-500" },
    amber:  { bg: dark ? "bg-amber-500/10"  : "bg-amber-50",  text: "text-amber-500" },
    violet: { bg: dark ? "bg-violet-500/10" : "bg-violet-50", text: "text-violet-500" },
  };
  const c = colors[color] || colors.teal;
  return (
    <div className={cls("rounded-2xl p-5 border transition-all hover:scale-[1.02] duration-200",
      dark ? "bg-[#111827] border-white/5 shadow-xl" : "bg-white border-slate-200 shadow-sm")}>
      <div className="flex items-start justify-between mb-3">
        <div className={cls("w-10 h-10 rounded-xl flex items-center justify-center shadow-lg", c.bg, c.text)}>
          <Icon d={icon} className="w-5 h-5" />
        </div>
        {change !== undefined && change !== null && (
          <span className={cls("text-xs font-bold px-2 py-0.5 rounded-full",
            change >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-400")}>
            {pct(change)}
          </span>
        )}
      </div>
      <p className={cls("text-2xl font-extrabold tracking-tight", dark ? "text-white" : "text-slate-900")}>{value}</p>
      <p className={cls("text-xs font-medium mt-1", dark ? "text-slate-500" : "text-slate-400")}>{label}</p>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   PAGE: OVERVIEW
   ═══════════════════════════════════════════════════════════════════ */
function OverviewPage({ sales, lineData, barData, fraud, dark }) {
  if (!sales) return <Loader dark={dark} />;
  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Daily Sales"        value={usd(sales.daily.total)}   change={sales.daily.change_pct}   icon={icons.chart}     color="teal"   dark={dark} />
        <StatCard label="Weekly Sales"       value={usd(sales.weekly.total)}  change={sales.weekly.change_pct}  icon={icons.dashboard} color="blue"   dark={dark} />
        <StatCard label="Total Transactions" value={sales.total_transactions} change={null}                     icon={icons.txn}       color="amber"  dark={dark} />
        <StatCard label="Active Branches"    value={sales.active_branches}    change={null}                     icon={icons.branch}    color="violet" dark={dark} />
      </div>

      {/* Cashier banner */}
      {sales.cashier_today > 0 && (
        <div className={cls("rounded-2xl border px-5 py-3.5 flex items-center gap-3",
          dark ? "bg-teal-500/5 border-teal-500/15" : "bg-teal-50 border-teal-100")}>
          <Icon d={icons.products} className={cls("w-5 h-5 shrink-0", dark ? "text-teal-400" : "text-teal-600")} />
          <p className={cls("text-sm", dark ? "text-teal-300" : "text-teal-700")}>
            <span className="font-bold">{sales.cashier_today} cashier transaction{sales.cashier_today !== 1 ? "s" : ""}</span>
            {" "}submitted today and reflected across all pages.
          </p>
        </div>
      )}

      {/* Fraud banner */}
      {sales.total_flagged > 0 && (
        <div className={cls("rounded-2xl border px-5 py-3.5 flex items-center gap-3",
          dark ? "bg-red-500/5 border-red-500/10" : "bg-red-50 border-red-100")}>
          <Icon d={icons.fraud} className={cls("w-5 h-5 shrink-0", dark ? "text-red-400" : "text-red-500")} />
          <p className={cls("text-sm", dark ? "text-red-300" : "text-red-700")}>
            <span className="font-bold">{sales.total_flagged} suspicious transaction{sales.total_flagged !== 1 ? "s" : ""}</span>
            {" "}flagged by fraud detection.
          </p>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Sales — Last 14 Days" dark={dark}>
          {lineData && (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={lineData.labels.map((l,i) => ({ day: shortDate(l), sales: lineData.values[i] }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#1e293b" : "#f1f5f9"} />
                <XAxis dataKey="day" tick={{ fontSize:11, fill:dark?"#64748b":"#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:11, fill:dark?"#64748b":"#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background:dark?"#1e293b":"#fff", border:"none", borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,.15)", fontSize:12 }}
                  formatter={v => [usd2(v), "Sales"]} />
                <Line type="monotone" dataKey="sales" stroke="#14b8a6" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Sales by Branch" dark={dark}>
          {barData && (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData.branches.map(b => ({ name: b.name.split(" ")[0], sales: b.sales }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#1e293b" : "#f1f5f9"} />
                <XAxis dataKey="name" tick={{ fontSize:10, fill:dark?"#64748b":"#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:11, fill:dark?"#64748b":"#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background:dark?"#1e293b":"#fff", border:"none", borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,.15)", fontSize:12 }}
                  formatter={v => [usd2(v), "Sales"]} />
                <Bar dataKey="sales" fill="#14b8a6" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Recent fraud alerts mini */}
      {fraud && fraud.alerts.length > 0 && (
        <div className={cls("rounded-2xl border p-5", dark ? "bg-red-500/5 border-red-500/10" : "bg-red-50 border-red-100")}>
          <h3 className={cls("text-sm font-bold mb-3 flex items-center gap-2", dark ? "text-red-400" : "text-red-600")}>
            <Icon d={icons.fraud} className="w-4 h-4" /> Recent Fraud Alerts
          </h3>
          <div className="flex flex-col gap-2">
            {fraud.alerts.slice(0, 4).map(a => (
              <div key={a.id} className={cls("flex items-center justify-between text-xs rounded-lg px-3 py-2",
                dark ? "bg-red-500/5 text-red-300" : "bg-white text-red-700")}>
                <span className="font-medium truncate flex-1">{a.message}</span>
                <span className="ml-3 opacity-60 shrink-0">{a.branch_name} • {usd2(a.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   PAGE: BRANCHES
   ═══════════════════════════════════════════════════════════════════ */
function BranchesPage({ branches, dark }) {
  if (!branches) return <Loader dark={dark} />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {branches.branches.map(b => (
        <div key={b.id} className={cls("rounded-2xl border p-5 transition-all hover:scale-[1.01] duration-200",
          dark ? "bg-[#111827] border-white/5" : "bg-white border-slate-200 shadow-sm")}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className={cls("font-bold text-sm", dark ? "text-white" : "text-slate-900")}>{b.name}</h3>
              <p className={cls("text-xs mt-0.5", dark ? "text-slate-500" : "text-slate-400")}>{b.city} • {b.id}</p>
            </div>
            <span className={cls("text-[10px] font-bold uppercase px-2.5 py-1 rounded-full",
              b.status === "active"
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-slate-500/10 text-slate-400")}>
              {b.status}
            </span>
          </div>
          {/* 4 metrics: Sales, Txns, Cashier, Flagged */}
          <div className="grid grid-cols-4 gap-2">
            {[
              ["Sales",   usd(b.total_sales),      null],
              ["Txns",    b.transaction_count,      null],
              ["Cashier", b.cashier_count ?? 0,     b.cashier_count > 0 ? "text-teal-400"  : null],
              ["Flagged", b.flagged_count,           b.flagged_count > 0 ? "text-red-400"   : null],
            ].map(([lbl, val, colorCls]) => (
              <div key={lbl} className="text-center">
                <p className={cls("text-base font-extrabold",
                  colorCls || (dark ? "text-white" : "text-slate-900"))}>{val}</p>
                <p className={cls("text-[10px] font-medium", dark ? "text-slate-500" : "text-slate-400")}>{lbl}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   PAGE: TRANSACTIONS
   ═══════════════════════════════════════════════════════════════════ */
function TransactionsPage({ token, dark }) {
  const [data, setData]     = useState(null);
  const [page, setPage]     = useState(1);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const path = filter === "all"
      ? `/transactions?page=${page}&per_page=20`
      : `/transactions?page=${page}&per_page=20&type=${filter}`;
    apiFetch(path, token).then(setData).catch(() => {});
  }, [page, filter, token]);

  if (!data) return <Loader dark={dark} />;

  const methodBadge = (m) => {
    const map = {
      credit_card: { label: "Credit",  cls: "bg-blue-500/10 text-blue-400" },
      debit_card:  { label: "Debit",   cls: "bg-violet-500/10 text-violet-400" },
      cash:        { label: "Cash",    cls: "bg-emerald-500/10 text-emerald-400" },
      mobile_pay:  { label: "Mobile",  cls: "bg-amber-500/10 text-amber-400" },
      contactless: { label: "Tap",     cls: "bg-cyan-500/10 text-cyan-400" },
      cashier:     { label: "Cashier", cls: "bg-teal-500/10 text-teal-400" },  // ← cashier support
    };
    const b = map[m] || { label: m, cls: "bg-slate-500/10 text-slate-400" };
    return <span className={cls("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", b.cls)}>{b.label}</span>;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filter buttons */}
      <div className="flex gap-2 flex-wrap items-center">
        {[["all","All"],["cashier","🛒 Cashier Only"],["pos","POS Only"]].map(([f,lbl]) => (
          <button key={f} onClick={() => { setFilter(f); setPage(1); }}
            className={cls("text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors",
              filter === f
                ? dark ? "bg-teal-500/15 border-teal-500/30 text-teal-400"
                       : "bg-teal-50 border-teal-200 text-teal-700"
                : dark ? "border-white/10 text-slate-400 hover:bg-white/5"
                       : "border-slate-200 text-slate-500 hover:bg-slate-50"
            )}>{lbl}</button>
        ))}
        <span className={cls("ml-auto text-xs", dark ? "text-slate-500" : "text-slate-400")}>
          {data.total} transactions
        </span>
      </div>

      <div className={cls("rounded-2xl border overflow-hidden",
        dark ? "bg-[#111827] border-white/5" : "bg-white border-slate-200 shadow-sm")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={dark ? "bg-white/[0.02]" : "bg-slate-50"}>
                {["ID","Branch","Product","Amount","Time","Method","Status"].map(h => (
                  <th key={h} className={cls("px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-left",
                    dark ? "text-slate-500" : "text-slate-400")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => {
                const isCashier  = t.type === "cashier";
                const suspicious = t.suspicious;
                return (
                  <tr key={t.id} className={cls(
                    "border-t transition-colors",
                    dark ? "border-white/5" : "border-slate-100",
                    suspicious
                      ? dark ? "bg-red-500/[0.04] hover:bg-red-500/[0.08]"
                             : "bg-red-50/50 hover:bg-red-50"
                      : isCashier
                      ? dark ? "bg-teal-500/[0.03] hover:bg-teal-500/[0.06]"
                             : "bg-teal-50/30 hover:bg-teal-50/60"
                      : dark ? "hover:bg-white/[0.02]"
                             : "hover:bg-slate-50/50"
                  )}>
                    <td className={cls("px-4 py-3 font-mono text-xs", dark ? "text-slate-300" : "text-slate-700")}>{t.id}</td>
                    <td className={cls("px-4 py-3 text-xs", dark ? "text-slate-400" : "text-slate-500")}>{t.branch_name}</td>
                    <td className={cls("px-4 py-3 text-xs", dark ? "text-slate-400" : "text-slate-500")}>
                      {t.product_name
                        ? <span className={cls("font-medium", dark ? "text-slate-200" : "text-slate-700")}>{t.product_name}</span>
                        : <span className={dark ? "text-slate-700" : "text-slate-300"}>—</span>}
                    </td>
                    <td className={cls("px-4 py-3 font-mono font-bold text-xs",
                      suspicious ? "text-red-400" : isCashier ? "text-teal-400" : "text-teal-500")}>{usd2(t.amount)}</td>
                    <td className={cls("px-4 py-3 text-xs", dark ? "text-slate-500" : "text-slate-400")}>
                      {shortDate(t.time)} {shortTime(t.time)}
                    </td>
                    <td className="px-4 py-3">{methodBadge(t.payment_method)}</td>
                    <td className="px-4 py-3">
                      {suspicious
                        ? <span className="text-[10px] font-bold bg-red-500/15 text-red-400 px-2.5 py-0.5 rounded-full">Suspicious</span>
                        : <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-500 px-2.5 py-0.5 rounded-full">Clean</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className={cls("text-xs", dark ? "text-slate-500" : "text-slate-400")}>
          Page {data.page} of {data.pages} • {data.total} transactions
        </p>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className={cls("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-30",
              dark ? "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                   : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}>
            Previous
          </button>
          <button disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}
            className={cls("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-30",
              dark ? "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                   : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   PAGE: FRAUD DETECTION
   ═══════════════════════════════════════════════════════════════════ */
function FraudPage({ fraud, dark }) {
  if (!fraud) return <Loader dark={dark} />;
  return (
    <div className="flex flex-col gap-5">
      <div className={cls("flex items-center gap-3 rounded-2xl border px-5 py-4",
        dark ? "bg-red-500/5 border-red-500/10" : "bg-red-50 border-red-100")}>
        <Icon d={icons.fraud} className={cls("w-6 h-6 shrink-0", dark ? "text-red-400" : "text-red-500")} />
        <div>
          <p className={cls("text-sm font-bold", dark ? "text-red-400" : "text-red-600")}>
            {fraud.total_flagged} suspicious transactions detected
          </p>
          <p className={cls("text-xs mt-0.5", dark ? "text-red-400/60" : "text-red-500/60")}>
            Rules: high amount vs average, rapid-fire bursts, repeated exact amounts
          </p>
        </div>
      </div>

      <div className={cls("rounded-2xl border overflow-hidden",
        dark ? "bg-[#111827] border-white/5" : "bg-white border-slate-200 shadow-sm")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={dark ? "bg-white/[0.02]" : "bg-slate-50"}>
                {["ID","Branch","Product","Amount","Time","Type","Risk","Reasons"].map(h => (
                  <th key={h} className={cls("px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-left",
                    dark ? "text-slate-500" : "text-slate-400")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fraud.suspicious_transactions.map(t => {
                const isCashier = t.type === "cashier";
                return (
                  <tr key={t.id} className={cls("border-t transition-colors",
                    dark ? "border-white/5 bg-red-500/[0.03] hover:bg-red-500/[0.07]"
                         : "border-slate-100 bg-red-50/30 hover:bg-red-50")}>
                    <td className={cls("px-5 py-3 font-mono text-xs", dark ? "text-slate-300" : "text-slate-700")}>{t.id}</td>
                    <td className={cls("px-5 py-3 text-xs", dark ? "text-slate-400" : "text-slate-500")}>{t.branch_name}</td>
                    <td className={cls("px-5 py-3 text-xs", dark ? "text-slate-400" : "text-slate-500")}>{t.product_name ?? "—"}</td>
                    <td className="px-5 py-3 font-mono font-bold text-xs text-red-400">{usd2(t.amount)}</td>
                    <td className={cls("px-5 py-3 text-xs", dark ? "text-slate-500" : "text-slate-400")}>
                      {shortDate(t.time)} {shortTime(t.time)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={cls("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                        isCashier ? "bg-teal-500/10 text-teal-400" : "bg-blue-500/10 text-blue-400")}>
                        {isCashier ? "Cashier" : "POS"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className={cls("w-12 h-1.5 rounded-full overflow-hidden",
                          dark ? "bg-slate-700" : "bg-slate-200")}>
                          <div className="h-full rounded-full bg-red-500" style={{width:`${t.risk_score}%`}} />
                        </div>
                        <span className="text-[10px] font-bold text-red-400">{t.risk_score}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-0.5">
                        {t.reasons.map((r,i) => (
                          <span key={i} className="text-[10px] text-red-400/80">{r}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   PAGE: ALERTS
   ═══════════════════════════════════════════════════════════════════ */
function AlertsPage({ fraud, dark }) {
  if (!fraud) return <Loader dark={dark} />;
  return (
    <div className="flex flex-col gap-3">
      {fraud.alerts.length === 0 && (
        <div className={cls("text-center py-16 text-sm", dark ? "text-slate-500" : "text-slate-400")}>
          No alerts — system is clean ✓
        </div>
      )}
      {fraud.alerts.map((a, i) => {
        const isHigh    = a.risk_score >= 70;
        const isCashier = a.type === "cashier";
        return (
          <div key={a.id}
            className={cls("rounded-2xl border px-5 py-4 flex items-start gap-4 transition-all",
              dark ? "bg-[#111827] border-white/5 hover:border-red-500/20"
                   : "bg-white border-slate-200 hover:border-red-200 shadow-sm")}
            style={{ animationDelay: `${i * 40}ms` }}>
            <div className={cls("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
              isHigh ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400")}>
              <Icon d={icons.fraud} className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <p className={cls("text-sm font-semibold", dark ? "text-white" : "text-slate-900")}>{a.message}</p>
                <div className="flex gap-1.5 shrink-0">
                  {isCashier && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400">
                      Cashier
                    </span>
                  )}
                  <span className={cls("text-[10px] font-bold px-2 py-0.5 rounded-full",
                    isHigh ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-500")}>
                    Risk {a.risk_score}%
                  </span>
                </div>
              </div>
              <p className={cls("text-xs mt-1", dark ? "text-slate-500" : "text-slate-400")}>
                {a.branch_name} • {a.transaction_id} • {usd2(a.amount)} • {shortDate(a.time)} {shortTime(a.time)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   PAGE: CHARTS (full analytics)
   ═══════════════════════════════════════════════════════════════════ */
function ChartsPage({ lineData, barData, dark }) {
  if (!lineData || !barData) return <Loader dark={dark} />;
  return (
    <div className="grid grid-cols-1 gap-6">
      <ChartCard title="Sales Over Time — Last 14 Days" dark={dark} tall>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={lineData.labels.map((l,i) => ({ day: shortDate(l), sales: lineData.values[i] }))}>
            <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#1e293b" : "#f1f5f9"} />
            <XAxis dataKey="day" tick={{ fontSize:11, fill:dark?"#64748b":"#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize:11, fill:dark?"#64748b":"#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ background:dark?"#1e293b":"#fff", border:"none", borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,.15)", fontSize:12 }}
              formatter={v => [usd2(v), "Sales"]} />
            <Line type="monotone" dataKey="sales" stroke="#14b8a6" strokeWidth={2.5} dot={{ r:3, fill:"#14b8a6" }} activeDot={{ r:5 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Transactions per Branch" dark={dark} tall>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={barData.branches}>
            <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#1e293b" : "#f1f5f9"} />
            <XAxis dataKey="name" tick={{ fontSize:9, fill:dark?"#64748b":"#94a3b8" }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize:11, fill:dark?"#64748b":"#94a3b8" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background:dark?"#1e293b":"#fff", border:"none", borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,.15)", fontSize:12 }} />
            <Bar dataKey="transactions" fill="#8b5cf6" radius={[6,6,0,0]} name="Transactions" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Revenue per Branch (incl. Cashier)" dark={dark} tall>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={barData.branches}>
            <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#1e293b" : "#f1f5f9"} />
            <XAxis dataKey="name" tick={{ fontSize:9, fill:dark?"#64748b":"#94a3b8" }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize:11, fill:dark?"#64748b":"#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ background:dark?"#1e293b":"#fff", border:"none", borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,.15)", fontSize:12 }}
              formatter={v => [usd2(v), "Revenue"]} />
            <Bar dataKey="sales" fill="#14b8a6" radius={[6,6,0,0]} name="Revenue" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Cashier Submissions per Branch" dark={dark} tall>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={barData.branches}>
            <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#1e293b" : "#f1f5f9"} />
            <XAxis dataKey="name" tick={{ fontSize:9, fill:dark?"#64748b":"#94a3b8" }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize:11, fill:dark?"#64748b":"#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ background:dark?"#1e293b":"#fff", border:"none", borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,.15)", fontSize:12 }} />
            <Bar dataKey="cashier_count" fill="#06b6d4" radius={[6,6,0,0]} name="Cashier Submissions" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   PAGE: CASHIER PRODUCTS  (new — mirrors main.py GET /api/products)
   ═══════════════════════════════════════════════════════════════════ */
function ProductsPage({ token, dark }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch("/products", token).then(setData).catch(() => {});
  }, [token]);

  if (!data) return <Loader dark={dark} />;

  return (
    <div className="flex flex-col gap-5">
      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Batches"   value={data.total_batches}         change={null} icon={icons.products} color="teal"  dark={dark} />
        <StatCard label="Total Products"  value={data.total_products}        change={null} icon={icons.txn}      color="blue"  dark={dark} />
        <StatCard label="Grand Total"     value={usd(data.grand_total ?? 0)} change={null} icon={icons.chart}    color="amber" dark={dark} />
      </div>

      {data.batches.length === 0 && (
        <div className={cls("rounded-2xl border p-12 text-center",
          dark ? "bg-[#111827] border-white/5" : "bg-white border-slate-200 shadow-sm")}>
          <p className={cls("text-sm font-semibold", dark ? "text-slate-400" : "text-slate-500")}>No batches yet</p>
          <p className={cls("text-xs mt-1", dark ? "text-slate-600" : "text-slate-400")}>
            Submit products from the cashier page — they will appear here.
          </p>
        </div>
      )}

      {data.batches.map((batch, i) => (
        <div key={batch.batch_id}
          className={cls("rounded-2xl border overflow-hidden",
            dark ? "bg-[#111827] border-white/5" : "bg-white border-slate-200 shadow-sm")}>
          {/* Batch header */}
          <div className={cls("flex flex-wrap items-center gap-3 px-5 py-4 border-b",
            dark ? "border-white/5" : "border-slate-100")}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-teal-500/10 text-teal-400">
              <Icon d={icons.products} className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cls("text-sm font-bold font-mono", dark ? "text-teal-400" : "text-teal-600")}>
                {batch.batch_id}
              </p>
              <p className={cls("text-xs mt-0.5", dark ? "text-slate-500" : "text-slate-400")}>
                {batch.branch_name} · {new Date(batch.submitted_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className={cls("text-sm font-extrabold", dark ? "text-white" : "text-slate-900")}>{usd2(batch.total)}</p>
              <p className={cls("text-[10px]", dark ? "text-slate-500" : "text-slate-400")}>
                {batch.count} item{batch.count !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* Cashier note */}
          {batch.cashier_note && (
            <div className={cls("px-5 py-2 text-xs italic border-b",
              dark ? "text-slate-500 bg-white/[0.01] border-white/5"
                   : "text-slate-400 bg-slate-50 border-slate-100")}>
              📝 {batch.cashier_note}
            </div>
          )}

          {/* Products table */}
          <table className="w-full text-sm">
            <thead>
              <tr className={dark ? "bg-white/[0.02]" : "bg-slate-50/60"}>
                {["#","Product Name","Price"].map((h, j) => (
                  <th key={h} className={cls("px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider",
                    j === 2 ? "text-right" : "text-left",
                    dark ? "text-slate-500" : "text-slate-400")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batch.products.map((p, j) => (
                <tr key={j} className={cls("border-t",
                  dark ? "border-white/5 hover:bg-white/[0.02]" : "border-slate-100 hover:bg-slate-50/50")}>
                  <td className={cls("px-5 py-2.5 text-xs font-mono", dark ? "text-slate-600" : "text-slate-400")}>{j+1}</td>
                  <td className={cls("px-5 py-2.5 text-xs font-medium", dark ? "text-slate-200" : "text-slate-700")}>{p.name}</td>
                  <td className="px-5 py-2.5 text-xs font-mono font-bold text-right text-teal-500">{usd2(p.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */
function ChartCard({ title, dark, children }) {
  return (
    <div className={cls("rounded-2xl border p-5",
      dark ? "bg-[#111827] border-white/5" : "bg-white border-slate-200 shadow-sm")}>
      <h3 className={cls("text-xs font-bold uppercase tracking-wider mb-4",
        dark ? "text-slate-500" : "text-slate-400")}>{title}</h3>
      {children}
    </div>
  );
}

function Loader({ dark }) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className={cls("w-7 h-7 border-2 rounded-full animate-spin",
        dark ? "border-slate-700 border-t-teal-400" : "border-slate-200 border-t-teal-500")} />
    </div>
  );
}

const PAGE_TITLES = {
  overview: "Dashboard Overview",
  branches: "Branch Monitoring",
  txns:     "Transaction History",
  fraud:    "Fraud Detection",
  alerts:   "Alert Center",
  charts:   "Analytics",
  products: "Cashier Products",
};


/* ═══════════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════════ */
export default function App() {
  const [dark, setDark]         = useState(true);
  const [token, setToken]       = useState(null);
  const [username, setUsername] = useState("");
  const [page, setPage]         = useState("overview");
  const [collapsed, setCollapsed] = useState(false);

  // Data
  const [sales, setSales]         = useState(null);
  const [fraud, setFraud]         = useState(null);
  const [branches, setBranches]   = useState(null);
  const [lineData, setLineData]   = useState(null);
  const [barData, setBarData]     = useState(null);

  const logout = () => {
    setToken(null); setUsername("");
    setSales(null); setFraud(null); setBranches(null);
    setLineData(null); setBarData(null);
  };

  // Fetch all shared data on login + every 10s (matches index.html/main.py cadence)
  useEffect(() => {
    if (!token) return;
    const load = () => {
      apiFetch("/sales",                  token).then(setSales).catch(e => { if (e.message === "UNAUTHORIZED") logout(); });
      apiFetch("/fraud",                  token).then(setFraud).catch(() => {});
      apiFetch("/branches",               token).then(setBranches).catch(() => {});
      apiFetch("/charts/sales-over-time", token).then(setLineData).catch(() => {});
      apiFetch("/charts/branch-breakdown",token).then(setBarData).catch(() => {});
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [token]);

  if (!token) {
    return <LoginScreen onLogin={(t, u) => { setToken(t); setUsername(u); }} dark={dark} />;
  }

  const render = () => {
    switch (page) {
      case "overview":  return <OverviewPage sales={sales} lineData={lineData} barData={barData} fraud={fraud} dark={dark} />;
      case "branches":  return <BranchesPage branches={branches} dark={dark} />;
      case "txns":      return <TransactionsPage token={token} dark={dark} />;
      case "fraud":     return <FraudPage fraud={fraud} dark={dark} />;
      case "alerts":    return <AlertsPage fraud={fraud} dark={dark} />;
      case "charts":    return <ChartsPage lineData={lineData} barData={barData} dark={dark} />;
      case "products":  return <ProductsPage token={token} dark={dark} />;
      default:          return null;
    }
  };

  return (
    <div className={cls("min-h-screen transition-colors duration-300",
      dark ? "bg-[#0a0e17] text-slate-100" : "bg-slate-100 text-slate-900")}>

      <Sidebar
        active={page}
        onChange={setPage}
        dark={dark}
        onToggleDark={() => setDark(d => !d)}
        onLogout={logout}
        collapsed={collapsed}
        onCollapse={() => setCollapsed(c => !c)}
        fraudCount={fraud?.total_flagged ?? 0}
      />

      <div className={cls("transition-all duration-300", collapsed ? "ml-[68px]" : "ml-60")}>
        {/* Top bar */}
        <header className={cls("sticky top-0 z-20 border-b backdrop-blur-xl h-16 flex items-center justify-between px-6",
          dark ? "bg-[#0a0e17]/80 border-white/5" : "bg-slate-100/80 border-slate-200")}>
          <h2 className="text-lg font-bold tracking-tight">{PAGE_TITLES[page]}</h2>
          <div className="flex items-center gap-3">
            <span className={cls("text-xs", dark ? "text-slate-500" : "text-slate-400")}>
              Auto-refresh every 10s
            </span>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-gradient-to-br from-teal-500 to-cyan-600 text-white">
              {username[0]?.toUpperCase() ?? "A"}
            </div>
          </div>
        </header>

        <main className="p-6">{render()}</main>
      </div>
    </div>
  );
}
