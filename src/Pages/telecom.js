import React, { useState, useRef, useEffect } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

import geoData from "../us-states.json";
import stateCodes from "../stateCodes";
import "../style/telecom.css";

export default function TelecomMap() {

  const [selectedStates, setSelectedStates] = useState(() => {
    return JSON.parse(localStorage.getItem("selectedStates")) || [];
  });

  const [search, setSearch] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [showSelected, setShowSelected] = useState(false);
  const [showNotSelected, setShowNotSelected] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // ✅ ONLY MAP EXPORT REFERENCE
  const exportRef = useRef();

  const allStates = geoData.features.map((f) => f.properties.name);

  const notSelectedStates = allStates.filter(
    (s) => !selectedStates.includes(s)
  );

  useEffect(() => {
    localStorage.setItem("selectedStates", JSON.stringify(selectedStates));
  }, [selectedStates]);

  const toggleState = (state) => {
    setSelectedStates((prev) =>
      prev.includes(state)
        ? prev.filter((s) => s !== state)
        : [...prev, state]
    );
  };

  // ✅ EXPORT ONLY MAP SECTION
const captureAndExport = async (type) => {
  try {
    setIsExporting(true);   // hide export button
    setShowExport(false);

    // ✅ WAIT for DOM update (VERY IMPORTANT)
    await new Promise((res) => setTimeout(res, 300));

    const mapEl = exportRef.current;

    const canvas = await html2canvas(mapEl, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
    });

    const imgData = canvas.toDataURL("image/png");

    if (type === "pdf") {
      const pdf = new jsPDF("landscape", "mm", "a4");

      const width = pdf.internal.pageSize.getWidth();
      const height = (canvas.height * width) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, width, height);
      pdf.save("usa-map.pdf");
    } else {
      const link = document.createElement("a");
      link.href = imgData;
      link.download = `usa-map.${type}`;
      link.click();
    }

  } catch (err) {
    console.error(err);
  } finally {
    setIsExporting(false); // show button again
  }
};

  const handleLogout = () => {
    alert("Logged out successfully!");
    localStorage.clear();
    window.location.href = "/";
  };

  return (
    <div className="page">

      {/* HEADER */}
      <header className="header">
        <div className="headerLeft">
          <a href="/" className="logoLink">
            <img src="/Image/img1.png" alt="logo" />
          </a>
        </div>

        <div className="headerCenter">
          <h2>Telecom Portfolio</h2>
        </div>

        <div className="headerRight">
          <button className="logoutBtn" onClick={handleLogout}>
            L
          </button>
        </div>
      </header>

      <div className="container">

        {/* ✅ EXPORT AREA ONLY */}
<div className="mapContainer" ref={exportRef}>
  {/* Title Container */}
  <div className="mapTitleContainer">
    <div className="mapTitle">Optical Fiber Network Coverage Map</div>
  </div>

  {/* Top bar containing the image */}
  <div className="mapTopBar">
    {/* Image Container */}
    <div className="mapImageContainer">
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/1/1a/Brosen_windrose.svg"
        alt="Compass"
        className="resized-image"
      />
    </div>
  </div>



          {/* EXPORT BUTTON */}
          <div className="export" style={{ display: isExporting ? "none" : "block" }}>
            <button onClick={() => setShowExport(!showExport)}>
              Export
            </button>

            {showExport && (
              <div className="dropdown">
                <div onClick={() => captureAndExport("png")}>PNG</div>
                <div onClick={() => captureAndExport("jpeg")}>JPG</div>
                <div onClick={() => captureAndExport("pdf")}>PDF</div>
              </div>
            )}
          </div>

{/* MAP */}
<div className="mapBox">
  <ComposableMap
    projection="geoAlbersUsa"
    width={1100}
    height={650}
    style={{ width: "100%", height: "100%" }}
  >
    <Geographies geography={geoData}>
      {({ geographies, projection }) =>
        geographies.map((geo) => {
          const name = geo.properties.name;
          const isSelected = selectedStates.includes(name);

          const fill =
            selectedStates.length === 0
              ? "#e5e7eb"
              : isSelected
              ? "#22c55e"
              : "#ef4444";

          const centroid = projection(geoCentroid(geo));

          return (
            <g key={geo.rsmKey}>
              <Geography
                geography={geo}
                onClick={() => toggleState(name)}
                style={{
                  default: {
                    fill,
                    outline: "none",
                    stroke: "#333333", // Set stroke to a light black (very dark gray)
                    strokeWidth: 0.8,
                  },
                  hover: {
                    fill: "#60a5fa",
                    cursor: "pointer",
                    stroke: "#333333", // Light black border on hover as well
                  },
                }}
              >
                <title>{name}</title>
              </Geography>

              {centroid && (
                <text
                  x={centroid[0]}
                  y={centroid[1]}
                  textAnchor="middle"
                  className="map-label"
                >
                  {stateCodes[name] || name}
                </text>
              )}
            </g>
          );
        })
      }
    </Geographies>
  </ComposableMap>

            <div className="mapLogo">
              <img src="/Image/img1.png" alt="logo" />
            </div>

          </div>
        </div>

        {/* ❌ SIDE PANEL (NOT INCLUDED IN EXPORT) */}
        <div className="sidePanel">

          <div className="panelCard">
            <h3>Choose USA States</h3>

            <input
              type="text"
              placeholder="Search state..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="searchBox"
            />

            <div className="scrollBox">
              {allStates
                .filter((state) =>
                  state.toLowerCase().includes(search.toLowerCase())
                )
                .map((state) => (
                  <label key={state}>
                    <input
                      type="checkbox"
                      checked={selectedStates.includes(state)}
                      onChange={() => toggleState(state)}
                    />
                    {state}
                  </label>
                ))}
            </div>
          </div>

          <div className="panelCard">
            <h3>Status</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  onClick={() => setShowSelected((prev) => !prev)}
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    border: "1px solid #999",
                    background: showSelected ? "#22c55e" : "white",
                    cursor: "pointer",
                  }}
                />
                <span>
                  <b>Selected:</b>{" "}
                  {showSelected ? selectedStates.length : "•••"}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  onClick={() => setShowNotSelected((prev) => !prev)}
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    border: "1px solid #999",
                    background: showNotSelected ? "#ef4444" : "white",
                    cursor: "pointer",
                  }}
                />
                <span>
                  <b>Not Selected:</b>{" "}
                  {showNotSelected ? notSelectedStates.length : "•••"}
                </span>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
