import React, { useEffect, useState } from "react";
import axios from "axios";
import { FaAward, FaQuoteLeft } from "react-icons/fa";
import "../style/footer.css";
// Yahan apni file ka sahi path dein
import data from "../quotes.json"; 

const Footer = () => {
  const [topPerformers, setTopPerformers] = useState([]);
  const [dailyQuote, setDailyQuote] = useState({ text: "", author: "" });

  useEffect(() => {
    // 1. Fetch Top Performers Data
    axios
      .get("http://localhost:5000/api/timesheet/all")
      .then((res) => {
        const timesheetData = res.data?.data || [];
        const performers = Object.values(
          timesheetData.reduce((acc, item) => {
            if (item.tlStatus === "Verified" || item.adminStatus === "Verified") {
              if (!acc[item.employeeName]) {
                acc[item.employeeName] = {
                  employeeName: item.employeeName,
                  domain: item.domain || "-",
                  totalHours: 0,
                };
              }
              acc[item.employeeName].totalHours += Number(item.hours || 0);
            }
            return acc;
          }, {})
        );

        const ranked = performers
          .sort((a, b) => b.totalHours - a.totalHours)
          .slice(0, 10);
        setTopPerformers(ranked);
      })
      .catch((err) => console.log("Footer API Error:", err));

    // 2. Daily Quote Logic (Har din ek naya quote)
    const quotesList = data.quotes; // JSON ke andar 'quotes' key access ki
    if (quotesList && quotesList.length > 0) {
      const today = new Date();
      // Date ke hisaab se index (Har din change hoga)
      const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
      const quoteIndex = dayOfYear % quotesList.length;
      
      const selected = quotesList[quoteIndex];
      setDailyQuote({
        text: selected.quote,
        author: selected.author
      });
    }
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
                    <div className="performer-row" key={index}>
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
                  <span className="quote-author">- {dailyQuote.author}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="footer__bottom">
        © 2026 Ecometrix Consultants Pvt. Ltd. All Rights Reserved.
      </div>
    </footer>
  );
};

export default Footer;