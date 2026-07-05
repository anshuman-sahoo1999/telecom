-- PostgreSQL Database Schema for Telecom DB (Lowercase columns for case-insensitivity)

DROP TABLE IF EXISTS work_updates CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS timesheet_entries CASCADE;
DROP TABLE IF EXISTS master_data CASCADE;
DROP TABLE IF EXISTS job_creation CASCADE;

-- 1. Table structure for table `job_creation`
CREATE TABLE job_creation (
  id SERIAL PRIMARY KEY,
  domain varchar(100) NOT NULL,
  market varchar(100) NOT NULL,
  jobid varchar(100) UNIQUE NOT NULL,
  receivedate date NOT NULL,
  ecddate date NOT NULL,
  submissiondate date NOT NULL,
  internalqc varchar(50) DEFAULT NULL,
  amdocsqc varchar(50) DEFAULT NULL,
  markuprequired varchar(50) DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT NULL,
  isedited smallint DEFAULT 0,
  employeename varchar(150) DEFAULT NULL
);

-- 2. Table structure for table `master_data`
CREATE TABLE master_data (
  id SERIAL PRIMARY KEY,
  domain varchar(100) NOT NULL,
  sow varchar(255) DEFAULT NULL,
  jobtype varchar(255) DEFAULT NULL,
  uom varchar(100) DEFAULT NULL,
  createdat timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedat timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table structure for table `timesheet_entries`
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

-- 4. Table structure for table `users`
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

-- 5. Table structure for table `work_updates`
CREATE TABLE work_updates (
  id SERIAL PRIMARY KEY,
  months text DEFAULT NULL,
  domain varchar(255) DEFAULT NULL,
  sow varchar(255) DEFAULT NULL,
  subdomain varchar(255) DEFAULT NULL,
  region varchar(255) DEFAULT NULL,
  state varchar(255) DEFAULT NULL,
  county varchar(255) DEFAULT NULL,
  jobsdelivered int DEFAULT 1,
  uom text DEFAULT NULL,
  file_name varchar(255) DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
