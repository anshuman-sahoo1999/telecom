import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Login from "./Pages/login";
import Telecom from "./Pages/telecom";   // Capital name


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/telecom" element={<Telecom />} />
      </Routes>
    </Router>
  );
}

export default App;