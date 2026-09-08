-- Telecom Database Schema for NeonDB (PostgreSQL)

-- Create Tables
CREATE TABLE IF NOT EXISTS capacity_forecast (
  id SERIAL PRIMARY KEY,
  month VARCHAR(50) NOT NULL,
  domain VARCHAR(100) NOT NULL,
  capacity INT DEFAULT 0,
  forecast INT DEFAULT 0,
  inflow INT DEFAULT 0,
  uom JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_creation (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(100) DEFAULT NULL,
  market VARCHAR(100) DEFAULT NULL,
  jobId VARCHAR(100) DEFAULT NULL,
  receiveDate DATE DEFAULT NULL,
  ecdDate DATE DEFAULT NULL,
  submissionDate DATE DEFAULT NULL,
  month VARCHAR(50) DEFAULT NULL,
  internalQc VARCHAR(50) DEFAULT NULL,
  amdocsQc VARCHAR(50) DEFAULT NULL,
  otp VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS master_data (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(100) NOT NULL,
  sow TEXT DEFAULT '[]',
  jobType TEXT DEFAULT '[]',
  uom TEXT DEFAULT '[]',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id SERIAL PRIMARY KEY,
  task VARCHAR(255) NOT NULL,
  startTime TIME NOT NULL,
  endTime TIME NOT NULL,
  hours NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  jobId VARCHAR(50) DEFAULT NULL,
  employeeName VARCHAR(255) DEFAULT NULL,
  tlStatus VARCHAR(50) DEFAULT NULL,
  adminStatus VARCHAR(50) DEFAULT NULL,
  tlRevisedReason TEXT DEFAULT NULL,
  adminRevisedReason TEXT DEFAULT NULL,
  teamMember VARCHAR(50) DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) DEFAULT NULL,
  emp_id VARCHAR(50) DEFAULT NULL,
  email VARCHAR(100) DEFAULT NULL,
  password VARCHAR(255) DEFAULT NULL,
  role VARCHAR(50) DEFAULT NULL,
  domain VARCHAR(100) DEFAULT NULL,
  memberType VARCHAR(50) DEFAULT NULL,
  totalExperience VARCHAR(50) DEFAULT NULL,
  telecomExperience VARCHAR(50) DEFAULT NULL,
  skillSets TEXT DEFAULT NULL,
  region VARCHAR(100) DEFAULT NULL,
  mobileNo VARCHAR(20) DEFAULT NULL,
  lastExpUpdate TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS work_updates (
  id SERIAL PRIMARY KEY,
  file_name VARCHAR(255) DEFAULT NULL,
  months JSONB DEFAULT '[]'::jsonb,
  domain VARCHAR(100) DEFAULT NULL,
  sow VARCHAR(255) DEFAULT NULL,
  job_type VARCHAR(255) DEFAULT NULL,
  region VARCHAR(100) DEFAULT NULL,
  state VARCHAR(100) DEFAULT NULL,
  county VARCHAR(100) DEFAULT NULL,
  uom JSONB DEFAULT '{}'::jsonb,
  jobs_delivered INT DEFAULT 0,
  job_id VARCHAR(100) DEFAULT NULL,
  current_status VARCHAR(100) DEFAULT NULL,
  production_engineers VARCHAR(255) DEFAULT NULL,
  qc_engineers VARCHAR(255) DEFAULT NULL,
  otp VARCHAR(255) DEFAULT NULL,
  internal_qc VARCHAR(255) DEFAULT NULL,
  amdocs_qc VARCHAR(255) DEFAULT NULL,
  receive_date DATE DEFAULT NULL,
  ecd_date DATE DEFAULT NULL,
  submission_date DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Users Data
INSERT INTO users (id, name, emp_id, email, password, role, domain, memberType, totalExperience, telecomExperience, skillSets, region, mobileNo, lastExpUpdate)
VALUES
  (53, 'Ajaya Kumar Sahoo', '150093', 'ajay.sahoo@ecometrix.co.in', '$2b$10$EzaQ.gZgKiIk/i52LYimq.xxzFxRrj7FDQDllzVlVDAbkUBlFmxBm', 'Admin', '', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (54, 'Mrunmay Tripathy', '15M009', 'mrunmaya.tripathy@ecometrix.co.in', '$2b$10$kh5AwRkj6agXYot6ZLSrv.34c980kkOjlkZnUeQkZMi/sDLOQDRfC', 'Admin', '', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (55, 'S. Srinibash', '150632', 's.srinibash@ecometrix.co.in', '$2b$10$gUadGpS3mfmXUJVBYVqSAOMwCWGEB/zFIuTwIeYgfz4uylXCZw.5W', 'Admin', '', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (62, 'Mohana Ghosh Maulik', '150680', 'mohanaghosh.maulik@ecometrix.co.in', '$2b$10$BSIeata5NbkPa97gtl7czuc9N3adhAilCBQqyk7JADOHJaU5pRk3q', 'MIS', '', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (63, 'Sunita Behera', '150667', 'sunitabehera706484@ecometrix.co.in', '$2b$10$RwSLlNdZCJSzwAARTg17pe7.Gtta7m8d2ynIk79AGAb4CnvT264M2', 'TeamMember', 'F2', 'QA,QC', NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Reset sequence for users
SELECT setval(pg_get_serialsequence('users', 'id'), COALESCE(MAX(id), 1)) FROM users;

-- Seed Initial Timesheet Data
INSERT INTO timesheet_entries (id, task, startTime, endTime, hours, created_at, jobId, employeeName, tlStatus, adminStatus, tlRevisedReason, adminRevisedReason, teamMember)
VALUES
  (39, 'To day I work on Telecome Projest...........', '14:00:00', '22:00:00', 8.00, '2026-07-04 09:18:36', '345672', 'Sunita Behera', 'Verified', 'Revised', NULL, '• n csnbzc msdz csdzschds', 'QA'),
  (40, 'vsxvsmbxsM', '13:18:00', '16:18:00', 3.00, '2026-07-09 06:48:40', '345672', 'Sunita Behera', 'Pending', 'Verified', NULL, NULL, 'QC')
ON CONFLICT (id) DO NOTHING;

-- Reset sequence for timesheet_entries
SELECT setval(pg_get_serialsequence('timesheet_entries', 'id'), COALESCE(MAX(id), 1)) FROM timesheet_entries;
