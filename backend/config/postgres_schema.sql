-- PostgreSQL Database Schema for Telecom DB

-- Drop tables if they exist (clean setup)
DROP TABLE IF EXISTS "work_updates" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "timesheet_entries" CASCADE;
DROP TABLE IF EXISTS "master_data" CASCADE;
DROP TABLE IF EXISTS "job_creation" CASCADE;

-- 1. Table structure for table `job_creation`
CREATE TABLE "job_creation" (
  "id" SERIAL PRIMARY KEY,
  "domain" varchar(100) NOT NULL,
  "market" varchar(100) NOT NULL,
  "jobId" varchar(100) UNIQUE NOT NULL,
  "receiveDate" date NOT NULL,
  "ecdDate" date NOT NULL,
  "submissionDate" date NOT NULL,
  "internalQc" varchar(50) DEFAULT NULL,
  "amdocsQc" varchar(50) DEFAULT NULL,
  "markupRequired" varchar(50) DEFAULT NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp DEFAULT NULL,
  "isEdited" smallint DEFAULT 0,
  "employeeName" varchar(150) DEFAULT NULL
);

-- 2. Table structure for table `master_data`
CREATE TABLE "master_data" (
  "id" SERIAL PRIMARY KEY,
  "domain" varchar(100) NOT NULL,
  "sow" varchar(255) DEFAULT NULL,
  "jobType" varchar(255) DEFAULT NULL,
  "uom" varchar(100) DEFAULT NULL,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table structure for table `timesheet_entries`
CREATE TABLE "timesheet_entries" (
  "id" SERIAL PRIMARY KEY,
  "task" varchar(255) NOT NULL,
  "startTime" time NOT NULL,
  "endTime" time NOT NULL,
  "hours" decimal(5,2) NOT NULL DEFAULT 0.00,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "jobId" varchar(50) DEFAULT NULL,
  "employeeName" varchar(255) DEFAULT NULL,
  "tlStatus" varchar(50) DEFAULT NULL,
  "adminStatus" varchar(50) DEFAULT NULL,
  "tlRevisedReason" text DEFAULT NULL,
  "adminRevisedReason" text DEFAULT NULL,
  "teamMember" varchar(50) DEFAULT NULL
);

-- 4. Table structure for table `users`
CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "name" varchar(100) DEFAULT NULL,
  "emp_id" varchar(50) UNIQUE DEFAULT NULL,
  "email" varchar(100) UNIQUE DEFAULT NULL,
  "password" varchar(255) DEFAULT NULL,
  "role" varchar(50) DEFAULT NULL CHECK ("role" IN ('Admin', 'MIS', 'TeamLead', 'TeamMember')),
  "domain" varchar(100) DEFAULT NULL,
  "memberType" varchar(10) DEFAULT NULL,
  "totalExperience" varchar(50) DEFAULT NULL,
  "telecomExperience" varchar(50) DEFAULT NULL,
  "skillSets" text DEFAULT NULL,
  "region" varchar(100) DEFAULT NULL,
  "mobileNo" varchar(20) DEFAULT NULL,
  "lastExpUpdate" timestamp DEFAULT NULL
);

-- 5. Table structure for table `work_updates`
CREATE TABLE "work_updates" (
  "id" SERIAL PRIMARY KEY,
  "months" text DEFAULT NULL,
  "domain" varchar(255) DEFAULT NULL,
  "sow" varchar(255) DEFAULT NULL,
  "subDomain" varchar(255) DEFAULT NULL,
  "region" varchar(255) DEFAULT NULL,
  "state" varchar(255) DEFAULT NULL,
  "county" varchar(255) DEFAULT NULL,
  "jobsDelivered" int DEFAULT 1,
  "uom" text DEFAULT NULL,
  "file_name" varchar(255) DEFAULT NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
