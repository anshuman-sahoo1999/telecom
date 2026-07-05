import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }) => {
  const user = localStorage.getItem("user");

  useEffect(() => {
    // Agar user logged in hai, toh back button block karne ka logic
    if (user) {
      // 1. Current page ki state ko browser history mein lock karein
      window.history.pushState(null, null, window.location.pathname);

      const blockBackNavigation = () => {
        // Dobara pushState karein taaki user back dabaaye toh bhi isi page par rahe
        window.history.pushState(null, null, window.location.pathname);
      };

      // Browser ke back button ('popstate') event ko sunein aur rokein
      window.addEventListener("popstate", blockBackNavigation);

      // Clean up: Jab component unmount ho (ya user logout kare) toh listener hata dein
      return () => {
        window.removeEventListener("popstate", blockBackNavigation);
      };
    }
  }, [user]);

  // Agar user login nahi hai, toh use login (/) page par bhej dein
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Agar user login hai, toh dashboard/pages dikhayein
  return children;
};

export default ProtectedRoute;