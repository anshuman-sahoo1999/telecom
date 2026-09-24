import { API_BASE_URL } from "../config";
import React, { useEffect, useState } from "react";
import axios from "axios";
import { FaAward, FaQuoteLeft } from "react-icons/fa";
import "../style/footer.css";
// Yahan apni file ka sahi path dein
import data from "../quotes.json";

const isVerified = (status) =>
  (status || "").toString().trim().toLowerCase() === "verified";

// Din ka number (1-366). UTC se nikala hai, taaki timezone/DST se index aage-peeche na ho
const getDayOfYear = (date) => {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((current - start) / (1000 * 60 * 60 * 24));
};

const Footer = () => {
  const [topPerformers, setTopPerformers] = useState([]);
  const [dailyQuote, setDailyQuote] = useState({ text: "", author: "" });

  useEffect(() => {
    let cancelled = false; // component hat jaye to state update na ho

    // 1. Fetch Top Performers Data
    axios
      .get(`${API_BASE_URL}/api/timesheet/all`)
      .then((res) => {
        if (cancelled) return;

        const raw = res.data;
        const timesheetData = Array.isArray(raw) ? raw : raw?.data || [];

        const performers = Object.values(
          timesheetData.reduce((acc, item) => {
            if (isVerified(item.tlStatus) || isVerified(item.adminStatus)) {
              // Naam khaali ho to "undefined" naam ka performer nahi banna chahiye
              const name = (item.employeeName || "").toString().trim();
              if (!name) return acc;

              if (!acc[name]) {
                acc[name] = {
                  employeeName: name,
                  domain: item.domain || "-",
                  totalHours: 0,
                };
              }

              // Pehli entry mein domain "-" ho aur baad mein mile to update kar do
              if (acc[name].domain === "-" && item.domain) {
                acc[name].domain = item.domain;
              }

              const hours = Number(item.hours || 0);
              acc[name].totalHours += isNaN(hours) ? 0 : hours;
            }
            return acc;
          }, {})
        );

        const ranked = performers
          .sort(
            (a, b) =>
              b.totalHours - a.totalHours ||
              a.employeeName.localeCompare(b.employeeName)
          )
          .slice(0, 10);
        setTopPerformers(ranked);
      })
      .catch((err) => console.log("Footer API Error:", err));

    // 2. Daily Quote Logic (Har din ek naya quote)
    // JSON { quotes: [...] } ho ya seedha [...] , dono chalega
    const quotesList = Array.isArray(data) ? data : data?.quotes;
    if (Array.isArray(quotesList) && quotesList.length > 0) {
      const quoteIndex = getDayOfYear(new Date()) % quotesList.length;

      const selected = quotesList[quoteIndex] || {};
      setDailyQuote({
        text: selected.quote || selected.text || "",
        author: selected.author || "",
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="footer">
      <div className="footer__container">
        <div className="footer__left">
          <img src="/Image/img3.png" alt="logo" className="footer__logo" />
          <h3>Ecometrix Consultants Pvt. Ltd.</h3>
          <p>DLF Cybercity, Patia, Bhubaneswar</p>
          <p>Odisha, India</p>
        </div>

        <div className="footer__right">
          <div className="footer__title">🏅 TOP PERFORMERS</div>
          <div className="main-scroll-window">
            <div className="main-scroll-track">
              <div className="achievement-card">
                {topPerformers.length > 0 ? (
                  topPerformers.map((item, index) => (
                    <div className="performer-row" key={item.employeeName}>
                      <div className="award-wrapper">
                        <FaAward className="award-icon" />
                        <span className="award-number">{index + 1}</span>
                      </div>
                      <div className="performer-info">
                        <span className="p-name">{item.employeeName}</span>
                        <span className="p-domain">{item.domain}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{ color: "#333", textAlign: "center", padding: "10px" }}>No data</p>
                )}
              </div>

              {dailyQuote.text && (
                <div className="quote-card">
                  <FaQuoteLeft className="quote-icon" />
                  <p className="quote-text">"{dailyQuote.text}"</p>
                  {dailyQuote.author && (
                    <span className="quote-author">- {dailyQuote.author}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="footer__bottom">
        © {new Date().getFullYear()} Ecometrix Consultants Pvt. Ltd. All Rights Reserved.
      </div>
    </footer>
  );
};

export default Footer;
