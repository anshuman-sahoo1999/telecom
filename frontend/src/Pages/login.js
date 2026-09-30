import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { API_BASE_URL } from "../config";
import "../style/login.css";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_KEYS = MONTH_NAMES.map((m) => m.toLowerCase());
const normalize = (d) => (d ?? "").toString().trim().toUpperCase();
const firstFilled = (...vals) =>
  vals.find((v) => v !== null && v !== undefined && String(v).trim() !== "");

const DOMAIN_COLORS = {
  ASE: "#3b82f6",
  F2: "#10b981",
  TCP: "#f59e0b",
  PERMIT: "#ef4444",
  LUMEN: "#8b5cf6",
  PLA: "#06b6d4",
  JPA: "#f97316",
};

const DEFAULT_DOMAIN_COLOR = "#6366f1";
const NEUTRAL_COLOR = "#cbd5e1";
const COLS = 4;
const REFRESH_MS = 60000;
const REQUEST_TIMEOUT_MS = 15000;

const parseMonthEntry = (m, fallbackYear) => {
  if (!m) return null;
  const match = String(m).trim().match(/^([A-Za-z]{3,})\W*(\d{2,4})?$/);
  if (!match) return null;
  const idx = MONTH_KEYS.indexOf(match[1].slice(0, 3).toLowerCase());
  if (idx < 0) return null;
  let year = fallbackYear;
  if (match[2]) year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  if (!Number.isFinite(year)) return null;
  return { idx, year };
};

const getJobs = (item) => Number(firstFilled(item?.jobsDelivered, item?.jobs_delivered)) || 0;

const parsePercent = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const str = val.toString().trim();
  const num = parseFloat(str.replace("%", ""));
  if (isNaN(num)) return null;
  const hasPercentSign = str.includes("%");
  const pct = !hasPercentSign && num > 0 && num <= 1 ? num * 100 : num;
  return Math.min(100, Math.max(0, Math.round(pct)));
};

const getQc = (item) => parsePercent(firstFilled(item?.amdocsQc, item?.amdocs_qc));

const isOtpMet = (val) => {
  if (val === null || val === undefined || val === "") return false;
  const str = val.toString().trim().toLowerCase();
  if (["yes", "y", "met", "true", "ok", "pass", "passed"].includes(str)) return true;
  if (["no", "n", "not met", "false", "fail", "failed", "0"].includes(str)) return false;
  const num = parseFloat(str.replace("%", ""));
  return !isNaN(num) && num > 0;
};

const getPerfColor = (val) => {
  if (val === null || val === undefined || isNaN(val)) return NEUTRAL_COLOR;
  if (val >= 90) return "#4ade80";
  if (val >= 80) return "#fbbf24";
  return "#f87171";
};

const formatPercent = (val) => (val !== null && val !== undefined ? `${val}%` : "--");

// Previous 2 months + current month (oldest -> current)
// Sep => Jul, Aug, Sep | Oct => Aug, Sep, Oct | Nov => Sep, Oct, Nov
const getMonthTabs = () => {
  const now = new Date();
  return [-2, -1, 0].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return {
      idx: d.getMonth(),
      year: d.getFullYear(),
      key: `${d.getMonth()}-${d.getFullYear()}`,
      label: MONTH_NAMES[d.getMonth()],
    };
  });
};

const parseDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  let v = d;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v.trim())) {
    v = v.trim().replace(" ", "T");
  }
  const parsed = new Date(v);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const pad2 = (n) => String(n).padStart(2, "0");
const formatLastUpdated = (d) => {
  if (!d) return "--";
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const day = pad2(ist.getUTCDate());
  const month = MONTH_NAMES[ist.getUTCMonth()];
  const year = ist.getUTCFullYear();
  let hour = ist.getUTCHours();
  const minute = pad2(ist.getUTCMinutes());
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${day} ${month} ${year} at ${pad2(hour)}:${minute} ${period} Hrs`;
};


const extractDomainNames = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data
      .map((x) => (typeof x === "object" && x !== null ? x.domain ?? x.name : x))
      .map(normalize)
      .filter(Boolean);
  }
  if (typeof data === "object") return Object.keys(data).map(normalize).filter(Boolean);
  return [];
};

const Login = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [emailDomain, setEmailDomain] = useState("@ecometrix.co.in");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /* ---------- Live Portal Progress Statistics ---------- */
  const [workData, setWorkData] = useState([]);
  const [masterDomains, setMasterDomains] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    const loadStats = async () => {
      const opts = { signal: controller.signal, timeout: REQUEST_TIMEOUT_MS };
      const [workRes, masterRes] = await Promise.allSettled([
        axios.get(`${API_BASE_URL}/api/work/all`, opts),
        axios.get(`${API_BASE_URL}/api/master`, opts),
      ]);
      if (!alive) return;

      if (workRes.status === "fulfilled") {
        setWorkData(Array.isArray(workRes.value.data) ? workRes.value.data : []);
      }
      if (masterRes.status === "fulfilled") {
        setMasterDomains(extractDomainNames(masterRes.value.data));
      }
      // Work data is the core of the panel: show error only if it never loaded
      setStatsError(workRes.status === "rejected" && masterRes.status === "rejected");
      setStatsLoading(false);
    };

    loadStats();
    const timer = setInterval(loadStats, REFRESH_MS);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const monthTabs = getMonthTabs();
  const currentTab = monthTabs[monthTabs.length - 1]; 
  const activeTab = monthTabs.find((t) => t.key === selectedKey) || currentTab;

  const domainRows = useMemo(() => {
    const fallbackYear = new Date().getFullYear();
    const map = {};

    workData.forEach((item) => {
      const domain = normalize(item?.domain);
      if (!domain) return;

      const inMonth = (Array.isArray(item?.months) ? item.months : []).some((m) => {
        const p = parseMonthEntry(m, fallbackYear);
        return p && p.idx === activeTab.idx && p.year === activeTab.year;
      });
      if (!inMonth) return;

      const s = map[domain] || (map[domain] = { jobs: 0, qcSum: 0, qcCount: 0, otpMet: 0, total: 0 });
      s.jobs += getJobs(item);
      const qcVal = getQc(item);
      if (qcVal !== null) {
        s.qcSum += qcVal;
        s.qcCount += 1;
      }
      s.total += 1;
      if (isOtpMet(item.otp)) s.otpMet += 1;
    });

    const names = [
      ...new Set([...masterDomains, ...workData.map((x) => normalize(x?.domain))]),
    ].filter(Boolean);

    return names.map((name) => {
      const s = map[name];
      return {
        name,
        color: DOMAIN_COLORS[name] || DEFAULT_DOMAIN_COLOR,
        jobs: s ? s.jobs : 0,
        qc: s && s.qcCount > 0 ? Math.round(s.qcSum / s.qcCount) : null,
        otp: s && s.total > 0 ? Math.round((s.otpMet / s.total) * 100) : null,
      };
    });
  }, [workData, masterDomains, activeTab.idx, activeTab.year]);


  const lastUpdated = useMemo(() => {
    let latest = null;
    workData.forEach((item) => {
      const d = parseDate(
        firstFilled(
          item?.updated_at,
          item?.updatedAt,
          item?.updated_on,
          item?.modified_at,
          item?.created_at,
          item?.createdAt
        )
      );
      if (d && (!latest || d > latest)) latest = d;
    });
    return latest;
  }, [workData]);

  /* ---------- Login ---------- */
  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError("");

    try {
      const trimmed = email.trim();
      const finalEmail = trimmed.includes("@") ? trimmed : `${trimmed}${emailDomain}`;

      const res = await axios.post(
        `${API_BASE_URL}/api/auth/login`,
        { login_id: finalEmail, password },
        { timeout: REQUEST_TIMEOUT_MS }
      );

      const { user, role, domain } = res.data || {};
      if (!user || !role) {
        throw new Error("Invalid response from server");
      }

      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("role", role);
      localStorage.setItem("name", user.name ?? "");
      localStorage.setItem("domain", domain ?? "");

      switch (String(role).toUpperCase()) {
        case "MASTER":
          navigate("/master-dashboard");
          break;
        case "ADMIN":
          navigate("/admin-dashboard/telecom");
          break;
        case "MIS":
          navigate("/mis-dashboard/telecom");
          break;
        case "TEAMLEAD":
          navigate("/teamlead-dashboard/telecom");
          break;
        case "TEAMMEMBER":
          navigate("/teammember-dashboard");
          break;
        default:
          navigate("/telecom");
      }
    } catch (err) {
      if (err.response) {
        setError(err.response.data?.message || "Login failed");
      } else if (err.request) {
        setError("Unable to reach the server. Please check your connection and try again.");
      } else {
        setError(err.message || "Login failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const lastRow = Math.floor((domainRows.length - 1) / COLS);

  return (
    <div className="auth-page">
      {/* ================= LEFT ================= */}
      <div className="auth-left">
        <div className="left-content">
          <h1>Welcome Telecom Work Status</h1>
          <p>Manage telecom users, plans, billing, and services in one system.</p>
        </div>

        <div className="live-stats">
          <div className="live-stats-header">
            {/* LIVE badge: red pill + blinking dot on the left */}
            <div className="live-badge">
              <span className="live-badge-ring">
                <span className="live-badge-dot" />
              </span>
              <span className="live-badge-text">Live Progress Summary</span>
            </div>
          </div>

          <div className="live-stats-controls">
            <div className="live-year-field">
              <span className="live-year-label">Year</span>
              <span className="live-year-value">{activeTab.year}</span>
            </div>

            <div className="live-month-tabs">
              {monthTabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`live-month-tab ${t.key === activeTab.key ? "active" : ""}`}
                  onClick={() => setSelectedKey(t.key)}
                >
                  {t.label}
                  {t.year !== currentTab.year && <small> '{String(t.year).slice(2)}</small>}
                </button>
              ))}
            </div>
          </div>

          <div className="live-domain-grid">
            {statsLoading && <div className="live-msg">Loading data...</div>}
            {!statsLoading && statsError && <div className="live-msg">Data not available</div>}
            {!statsLoading && !statsError && domainRows.length === 0 && (
              <div className="live-msg">No domains found</div>
            )}

            {!statsLoading &&
              !statsError &&
              domainRows.map((d, i) => {
                const isLastInRow = i % COLS === COLS - 1;
                const isVeryLast = i === domainRows.length - 1;
                const cls = [
                  "live-domain-cell",
                  isLastInRow || isVeryLast ? "no-right" : "",
                  Math.floor(i / COLS) === lastRow ? "no-bottom" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div key={d.name} className={cls} style={{ "--themeColor": d.color }}>
                    <div className="live-domain-name">{d.name}</div>
                    <div className="live-domain-jobs">
                      {d.jobs}
                      <span> Jobs</span>
                    </div>
                    <div className="live-domain-metrics">
                      <span style={{ color: getPerfColor(d.qc) }}>QC: {formatPercent(d.qc)}</span>
                      <span style={{ color: getPerfColor(d.otp) }}>OTP: {formatPercent(d.otp)}</span>
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="live-last-updated">Last Updated: {formatLastUpdated(lastUpdated)}</div>
        </div>
      </div>

      {/* ================= RIGHT ================= */}
      <div
        className="auth-right"
        style={{
          backgroundImage: `url("/Image/img2.png")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center bottom",
          backgroundSize: "contain",
          backgroundColor: "#ffffff",
        }}
      >
        <div className="auth-card">
          <img className="auth-logo" src="/Image/img3.png" alt="EMC logo" />
          <h2>Login</h2>
          <p>Enter your email and password</p>

          <form onSubmit={handleLogin}>
            {/* Email Box */}
            <div className="email-input-group">
              <input
                type="text"
                className="email-input-field"
                placeholder="Email..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                aria-label="Email"
                required
              />

              <select
                className="email-domain-select"
                value={emailDomain}
                onChange={(e) => setEmailDomain(e.target.value)}
                aria-label="Email domain"
              >
                <option value="@ecometrix.co.in">@ecometrix.co.in</option>
                <option value="@gmail.com">@gmail.com</option>
                <option value="@outlook.com">@outlook.com</option>
                <option value="@yahoo.com">@yahoo.com</option>
                <option value="@zoho.com">@zoho.com</option>
                <option value="@rediffmail.com">@rediffmail.com</option>
              </select>
            </div>

            {/* Password Box */}
            <div className="password-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-label="Password"
                required
              />

              <span
                className="password-eye"
                role="button"
                tabIndex={0}
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((prev) => !prev)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setShowPassword((prev) => !prev);
                  }
                }}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </span>
            </div>

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={isLoading}>
              {isLoading ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
