import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Footer from "./footer";
import {
  FaSignOutAlt,
  FaCog,
  FaSun,
  FaMoon,
  FaCalendarAlt,
  FaClock,
  FaUser,
} from "react-icons/fa";
import "../style/header.css";

export default function Header() {
  const [showLogout, setShowLogout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState("light");
  const [accent, setAccent] = useState("#2563eb");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [menuOpen, setMenuOpen] = useState(window.innerWidth > 1100);
  
  // Logout Loading State
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || {};
    } catch {
      return {};
    }
  })();

  const hasDomain = user?.domain && user.domain.trim() !== "";
  const domain = user?.domain || "";
  const memberType = user?.memberType || "";

  const hour = currentTime.getHours();

  let greeting = "";
  if (hour < 12) greeting = "Good Morning";
  else if (hour < 17) greeting = "Good Afternoon";
  else greeting = "Good Evening";

  const date = currentTime.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Navigation and Session Control Effect
  useEffect(() => {
    const blockBackNavigation = () => {
      if (localStorage.getItem("user")) {
        window.history.pushState(null, null, window.location.pathname);
      }
    };

    if (localStorage.getItem("user")) {
      window.history.pushState(null, null, window.location.pathname);
    }

    window.addEventListener("popstate", blockBackNavigation);

    const handlePageShow = () => {
      if (!localStorage.getItem("user")) {
        window.location.replace("/");
      }
    };
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("popstate", blockBackNavigation);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  // Window Resize Effect
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1100) {
        setMenuOpen(true);
      } else {
        setMenuOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const time = currentTime.toLocaleTimeString();

  // Clock Timer Effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Custom Logout Handler with Loading Spinner
  const handleLogout = () => {
    setIsLoggingOut(true); // Spinner/Blank screen चालू करें

    setTimeout(() => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace("/"); // 2 सेकंड बाद लॉगआउट करें
    }, 2000); 
  };

  return (
    <div
      className={`layout ${theme}`}
      style={{ "--accent-color": accent }}
    >
      {/* FULL SCREEN LOGOUT LOADER */}
      {isLoggingOut && (
        <div style={spinnerOverlayStyle}>
          <div style={spinnerStyle}></div>
          <p style={{ color: "#ffffff", marginTop: "15px", fontFamily: "sans-serif", fontSize: "18px" }}>
            Logging out safely...
          </p>
        </div>
      )}

      <div className="sticky-navbar">
        <div className="top-bar">
          <div className="tb-left">
            ECOMETRIX CONSULTANT PVT. LTD | ଇକୋମେଟ୍ରିକ୍ସ କନସଲଟାଣ୍ଟ ପ୍ରାଇଭେଟ ଲିମିଟେଡ଼
          </div>

          <div className="tb-right">
            <span className="dateTime">
              <FaCalendarAlt />
              {date}
            </span>

            <span className="dateTime">
              <FaClock />
              {time}
            </span>

            <div className="settings-wrapper">
              <div
                className={`settings-icon-wrapper ${showSettings ? "active" : ""}`}
                onClick={() => setShowSettings(!showSettings)}
              >
                <FaCog className="settings-icon" />
              </div>

              {showSettings && (
                <div className="settings-dropdown">
                  <div className="s-header">⚙️ Profile Settings</div>

                  <div className="s-section">
                    <label>Appearance</label>
                    <div className="theme-toggle">
                      <button
                        className={theme === "light" ? "active" : ""}
                        onClick={() => setTheme("light")}
                      >
                        <FaSun /> Light
                      </button>

                      <button
                        className={theme === "dark" ? "active" : ""}
                        onClick={() => setTheme("dark")}
                      >
                        <FaMoon /> Dark
                      </button>
                    </div>
                  </div>

                  <div className="s-section">
                    <label>Accent Color</label>
                    <div className="color-palette">
                      {[
                        "#10b981",
                        "#2563eb",
                        "#dc2626",
                        "#7c3aed",
                      ].map((c) => (
                        <span
                          key={c}
                          style={{
                            background: c,
                            border: accent === c ? "2px solid #000" : "none",
                          }}
                          onClick={() => setAccent(c)}
                        ></span>
                      ))}
                    </div>
                  </div>

                  <div className="s-section">
                    <label>Custom Color</label>
                    <input
                      type="color"
                      value={accent}
                      onChange={(e) => setAccent(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* HEADER */}
        <header className="header">
          <div className="headerLeft">
            <img src="/Image/img3.png" alt="" className="logo" />
            <div className="companyInfo">
              <h2>Telecom Work Status Dashboard</h2>
              <h3>
                {greeting}, {user?.name || "User"}
                {user?.role && (
                  <>
                    {" ("}
                    {user.role}
                    {memberType ? ` (${memberType})` : ""}
                    {")"}
                    {hasDomain ? ` - ${domain}` : ""}
                  </>
                )}
              </h3>
            </div>
          </div>

          <div className="headerRight">
            <div className="userWrapper">
              <div
                className="userBox"
                onClick={() => setShowLogout(!showLogout)}
              >
                <FaUser className="userIcon" />
              </div>
              {window.innerWidth <= 1100 && (
                <div
                  className={`menu-icon ${menuOpen ? "active" : ""}`}
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  <span className="bar1"></span>
                  <span className="bar2"></span>
                  <span className="bar3"></span>
                </div>
              )}
            </div>

            {showLogout && (
              <div className="logoutPopup">
                <div className="popupItem" onClick={handleLogout}>
                  <FaSignOutAlt />
                  Logout
                </div>
              </div>
            )}
          </div>
        </header>
      </div>

      <main className="main-content">
        <Outlet context={{ menuOpen, setMenuOpen }} />
      </main>

      <Footer />

      {/* Spinner Animation Styles */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// --- CSS Styles For Spinner Loader ---
const spinnerOverlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  backgroundColor: "#111111", // पूरी स्क्रीन को डार्क/ब्लैंक करने के लिए
  zIndex: 99999, // सबसे ऊपर दिखेगा
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
};

const spinnerStyle = {
  width: "50px",
  height: "50px",
  border: "5px solid #f3f3f3",
  borderTop: "5px solid var(--accent-color, #2563eb)", // आपके थीम कलर के हिसाब से घूमेगा
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
};