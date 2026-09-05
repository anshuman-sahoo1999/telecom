-- PostgreSQL Database Schema for Telecom DB (Combined & Updated based on uploaded schema, lowercase columns for case-insensitivity)

DROP TABLE IF EXISTS work_updates CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS timesheet_entries CASCADE;
DROP TABLE IF EXISTS master_data CASCADE;
DROP TABLE IF EXISTS job_creation CASCADE;
DROP TABLE IF EXISTS capacity_forecast CASCADE;

-- 1. Table structure for table `capacity_forecast`
CREATE TABLE capacity_forecast (
  id SERIAL PRIMARY KEY,
  month varchar(50) NOT NULL,
  domain varchar(100) NOT NULL,
  capacity int DEFAULT 0,
  forecast int DEFAULT 0,
  inflow int DEFAULT 0,
  uom text DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table structure for table `job_creation`
CREATE TABLE job_creation (
  id SERIAL PRIMARY KEY,
  domain varchar(100) DEFAULT NULL,
  market varchar(100) DEFAULT NULL,
  jobid varchar(100) UNIQUE DEFAULT NULL,
  receivedate date DEFAULT NULL,
  ecddate date DEFAULT NULL,
  submissiondate date DEFAULT NULL,
  month varchar(50) DEFAULT NULL,
  internalqc varchar(50) DEFAULT NULL,
  amdocsqc varchar(50) DEFAULT NULL,
  otp varchar(50) DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table structure for table `master_data`
CREATE TABLE master_data (
  id SERIAL PRIMARY KEY,
  domain varchar(100) NOT NULL,
  sow varchar(255) DEFAULT NULL,
  jobtype varchar(255) DEFAULT NULL,
  uom varchar(100) DEFAULT NULL,
  createdat timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedat timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Table structure for table `timesheet_entries`
CREATE TABLE timesheet_entries (
  id SERIAL PRIMARY KEY,
  task varchar(255) NOT NULL,
  starttime time NOT NULL,
  endtime time NOT NULL,
  hours decimal(5,2) NOT NULL DEFAULT 0.00,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  jobid varchar(50) DEFAULT NULL,
  employeename varchar(255) DEFAULT NULL,
  tlstatus varchar(50) DEFAULT NULL,
  adminstatus varchar(50) DEFAULT NULL,
  tlrevisedreason text DEFAULT NULL,
  adminrevisedreason text DEFAULT NULL,
  teammember varchar(50) DEFAULT NULL
);

-- 5. Table structure for table `users`
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name varchar(100) DEFAULT NULL,
  emp_id varchar(50) UNIQUE DEFAULT NULL,
  email varchar(100) UNIQUE DEFAULT NULL,
  password varchar(255) DEFAULT NULL,
  role varchar(50) DEFAULT NULL CHECK (role IN ('Admin', 'MIS', 'TeamLead', 'TeamMember')),
  domain varchar(100) DEFAULT NULL,
  membertype varchar(10) DEFAULT NULL,
  totalexperience varchar(50) DEFAULT NULL,
  telecomexperience varchar(50) DEFAULT NULL,
  skillsets text DEFAULT NULL,
  region varchar(100) DEFAULT NULL,
  mobileno varchar(20) DEFAULT NULL,
  lastexpupdate timestamp DEFAULT NULL
);

-- 6. Table structure for table `work_updates`
CREATE TABLE work_updates (
  id SERIAL PRIMARY KEY,
  file_name varchar(255) DEFAULT NULL,
  months text DEFAULT NULL,
  domain varchar(100) DEFAULT NULL,
  sow varchar(255) DEFAULT NULL,
  job_type varchar(255) DEFAULT NULL,
  region varchar(100) DEFAULT NULL,
  state varchar(100) DEFAULT NULL,
  county varchar(100) DEFAULT NULL,
  uom text DEFAULT NULL,
  jobs_delivered int DEFAULT 0,
  job_id varchar(100) UNIQUE DEFAULT NULL,
  current_status varchar(100) DEFAULT NULL,
  production_engineers varchar(255) DEFAULT NULL,
  qc_engineers varchar(255) DEFAULT NULL,
  otp varchar(255) DEFAULT NULL,
  internal_qc varchar(255) DEFAULT NULL,
  amdocs_qc varchar(255) DEFAULT NULL,
  receive_date date DEFAULT NULL,
  ecd_date date DEFAULT NULL,
  submission_date date DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
