import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import "../style/login.css";

const Login = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [emailDomain, setEmailDomain] = useState("@ecometrix.co.in");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const finalEmail = email.includes("@")
        ? email.trim()
        : `${email.trim()}${emailDomain}`;

      const res = await axios.post(
        "http://localhost:5000/api/auth/login",
        {
          login_id: finalEmail,
          password,
        }
      );

      localStorage.setItem("user", JSON.stringify(res.data.user));
      localStorage.setItem("role", res.data.role);
      localStorage.setItem("name", res.data.user.name);   // ✅ ADD THIS
      localStorage.setItem("domain", res.data.domain);

      switch (res.data.role) {
        case "MASTER":
          navigate("/master-dashboard");
          break;

        case "Admin":
          navigate("/admin-dashboard/telecom");
          break;

        case "MIS":
          navigate("/mis-dashboard/telecom");
          break;

        case "TeamLead":
          navigate("/teamlead-dashboard/telecom");
          break;

        case "TeamMember":
          navigate("/teammember-dashboard");
          break;

        default:
          navigate("/telecom");
      }
    } catch (error) {
      setError(error.response?.data?.message || "Login failed");
    }

    setIsLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="logo-box">
          <img src="Image/img1.png" alt="logo" />
        </div>

        <div className="left-content">
          <h1>Welcome Telecom Work Status</h1>
          <p>
            Manage telecom users, plans, billing, and services in one system.
          </p>
        </div>
      </div>

      <div
        className="auth-right"
        style={{
          
          backgroundImage: `url(${"/Image/img2.png"})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center bottom",
          backgroundSize: "contain",
          backgroundColor: " #ffffff"
        }}
      >
        <div className="auth-card">
          <h2>Login</h2>
          <p>Enter your email and password</p>

          <form onSubmit={handleLogin} autoComplete="off">
            {/* Email Box */}
            <div className="email-input-group">
              <input
                type="text"
                className="email-input-field"
                placeholder="Email..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                required
              />

              <select
                className="email-domain-select"
                value={emailDomain}
                onChange={(e) => setEmailDomain(e.target.value)}
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
                autoComplete="new-password"
                required
              />

              <span
                className="password-eye"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </span>
            </div>

            {error && <p className="error">{error}</p>}

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