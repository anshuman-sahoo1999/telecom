import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import axios from "axios";

// Redirect all localhost API requests to production API URL if set in env
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

if (process.env.REACT_APP_API_URL) {
  // Monkeypatch fetch
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === "string" && input.startsWith("http://localhost:5000")) {
      input = input.replace("http://localhost:5000", API_BASE_URL);
    } else if (input instanceof Request && input.url.startsWith("http://localhost:5000")) {
      input = new Request(input.url.replace("http://localhost:5000", API_BASE_URL), input);
    }
    return originalFetch(input, init);
  };

  // Intercept Axios
  axios.interceptors.request.use((config) => {
    if (config.url && config.url.startsWith("http://localhost:5000")) {
      config.url = config.url.replace("http://localhost:5000", API_BASE_URL);
    }
    return config;
  }, (error) => {
    return Promise.reject(error);
  });
}
<meta name="viewport" content="width=device-width, initial-scale=1.0"></meta>

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);