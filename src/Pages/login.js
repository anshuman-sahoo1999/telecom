// src/Pages/login.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../style/login.css';

const Login = () => {
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();

    setIsLoading(true);
    setError('');

    if (username === '' || password === '') {
      setError('Please enter username and password');
      setIsLoading(false);
      return;
    }

    setTimeout(() => {
      localStorage.setItem('token', 'dummy-token');
      navigate('/telecom');
    }, 1000);
  };

  return (
    <div className="login-container">
      <div className="login-form">

        <h2 className="login-title">Login</h2>

        <form onSubmit={handleLogin} className="form-fields">

          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="form-input"
            />
          </div>

          {error && <p className="error-message">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="submit-button"
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>

        </form>

        {/* Forgot Password Link */}
        <p
          className="forgot-password"
          onClick={() => navigate('/forgot-password')}
          style={{ cursor: 'pointer', marginTop: '10px', color: '#007bff' }}
        >
          Forgot Password?
        </p>

      </div>
    </div>
  );
};

export default Login;
