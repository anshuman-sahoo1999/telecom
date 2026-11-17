import { API_BASE_URL } from "../config";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FileSpreadsheet, FileText } from "lucide-react";
import "../style/rawdata.css";

const PAGE_SIZES = [25, 50, 100, 500, "All"];

const show = (v) => (v === null || v === undefined ? "" : String(v));

export default function RawDataReport() {
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState("ALL");
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [exporting, setExporting] = useState("");

  /* domain dropdown */
  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/api/rawdata/domains`)
      .then((r) => setDomains(r.data?.data || []))
      .catch(() => {});
  }, []);

  /* table data (domain change par dobara) */
  const load = useCallback(async (d) => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`${API_BASE_URL}/api/rawdata`, { params: { domain: d } });
      setColumns(res.data?.columns || []);
      setRows(res.data?.data || []);
      setPage(1);
    } catch (e) {
      setError(e.response?.data?.message || "Data load nahi ho paya.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(domain);
  }, [domain, load]);

  const totalPages = pageSize === "All" ? 1 : Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = useMemo(() => {
    if (pageSize === "All") return rows;
    const s = (page - 1) * pageSize;
    return rows.slice(s, s + pageSize);
  }, [rows, page, pageSize]);

  const label = domain === "ALL" ? "All_Domains" : domain.replace(/[^\w-]+/g, "_");

  /* ---- Export Excel (backend se) ---- */
  const exportExcel = async () => {
    setExporting("excel");
    try {
      const res = await axios.get(`${API_BASE_URL}/api/rawdata/export/excel`, {
        params: { domain },
        responseType: "blob",
      });
      saveAs(res.data, `Raw_Data_Report_${label}.xlsx`);
    } catch (e) {
      setError("Excel export fail hua. Dobara try karein.");
    } finally {
      setExporting("");
    }
  };

  /* ---- Export PDF (selected domain ka poora data) ---- */
  const exportPdf = () => {
    setExporting("pdf");
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
      doc.setFontSize(16);
      doc.setTextColor(30, 58, 138);
      doc.text("Raw Data Report", 30, 32);
      doc.setFontSize(10);
      doc.setTextColor(80);
      doc.text(
        `Domain: ${domain === "ALL" ? "All Domains" : domain}   |   Total Rows: ${rows.length}   |   Generated: ${new Date().toLocaleString()}`,
        30,
        50
      );

      autoTable(doc, {
        startY: 62,
        head: [columns.map((c) => c.header)],
        body: rows.map((r) => columns.map((c) => show(r[c.key]))),
        styles: { fontSize: 6, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 6, halign: "center" },
        alternateRowStyles: { fillColor: [244, 247, 252] },
        margin: { left: 20, right: 20, bottom: 28 },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(120);
          doc.text(
            `Page ${doc.getNumberOfPages()}`,
            doc.internal.pageSize.getWidth() - 60,
            doc.internal.pageSize.getHeight() - 12
          );
        },
      });
      doc.save(`Raw_Data_Report_${label}.pdf`);
    } catch (e) {
      console.error(e);
      setError("PDF export fail hua.");
    } finally {
      setExporting("");
    }
  };

  const noData = !loading && rows.length === 0;

  return (
    <div className="rd-page">
      <h2 className="rd-title">Raw Data Report</h2>

      <div className="rd-card">
        {/* upar: left = Domain select, right = Export Excel / PDF */}
        <div className="rd-toolbar">
          <div className="left">
            <label htmlFor="rd-domain">Domain</label>
            <select
              id="rd-domain"
              className="rd-select"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            >
              <option value="ALL">All Domains</option>
              {domains.map((d) => (
                <option key={d.domain} value={d.domain}>
                  {d.domain} ({d.total})
                </option>
              ))}
            </select>
          </div>

          <div className="right">
            <button className="rd-btn green" onClick={exportExcel} disabled={noData || loading || !!exporting}>
              <FileSpreadsheet size={16} /> {exporting === "excel" ? "Exporting..." : "Export Excel"}
            </button>
            <button className="rd-btn red" onClick={exportPdf} disabled={noData || loading || !!exporting}>
              <FileText size={16} /> {exporting === "pdf" ? "Exporting..." : "Export PDF"}
            </button>
          </div>
        </div>

        {error && <div style={{ color: "#dc2626", marginBottom: 10, fontWeight: 600 }}>{error}</div>}

        {loading ? (
          <div className="rd-state">Loading...</div>
        ) : noData ? (
          <div className="rd-state">Koi data nahi mila. Pehle Raw Data Upload me Excel import karein.</div>
        ) : (
          <>
            <div className="rd-count">Total records: {rows.length}</div>
            <div className="rd-tablewrap">
              <table className="rd-table">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key}>{c.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={i}>
                      {columns.map((c) => (
                        <td key={c.key}>{show(r[c.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rd-pager">
              <div className="c">
                Rows per page
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPageSize(v === "All" ? "All" : Number(v));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="c">
                <button className="rd-btn gray sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </button>
                <span>
                  Page {page} / {totalPages}
                </span>
                <button
                  className="rd-btn gray sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
