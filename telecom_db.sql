-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 05, 2026 at 11:06 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `telecom_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `capacity_forecast`
--

CREATE TABLE `capacity_forecast` (
  `id` int(11) NOT NULL,
  `month` varchar(50) NOT NULL,
  `domain` varchar(100) NOT NULL,
  `capacity` int(11) DEFAULT 0,
  `forecast` int(11) DEFAULT 0,
  `inflow` int(11) DEFAULT 0,
  `uom` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`uom`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `job_creation`
--

CREATE TABLE `job_creation` (
  `id` int(11) NOT NULL,
  `domain` varchar(100) DEFAULT NULL,
  `market` varchar(100) DEFAULT NULL,
  `jobId` varchar(100) DEFAULT NULL,
  `receiveDate` date DEFAULT NULL,
  `ecdDate` date DEFAULT NULL,
  `submissionDate` date DEFAULT NULL,
  `month` varchar(50) DEFAULT NULL,
  `internalQc` varchar(50) DEFAULT NULL,
  `amdocsQc` varchar(50) DEFAULT NULL,
  `otp` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Table structure for table `master_data`
--

CREATE TABLE `master_data` (
  `id` int(11) NOT NULL,
  `domain` varchar(100) NOT NULL,
  `sow` varchar(255) DEFAULT NULL,
  `jobType` varchar(255) DEFAULT NULL,
  `uom` varchar(100) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `timesheet_entries`
--

CREATE TABLE `timesheet_entries` (
  `id` int(11) NOT NULL,
  `task` varchar(255) NOT NULL,
  `startTime` time NOT NULL,
  `endTime` time NOT NULL,
  `hours` decimal(5,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `jobId` varchar(50) DEFAULT NULL,
  `employeeName` varchar(255) DEFAULT NULL,
  `tlStatus` varchar(50) DEFAULT NULL,
  `adminStatus` varchar(50) DEFAULT NULL,
  `tlRevisedReason` text DEFAULT NULL,
  `adminRevisedReason` text DEFAULT NULL,
  `teamMember` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `timesheet_entries`
--

INSERT INTO `timesheet_entries` (`id`, `task`, `startTime`, `endTime`, `hours`, `created_at`, `jobId`, `employeeName`, `tlStatus`, `adminStatus`, `tlRevisedReason`, `adminRevisedReason`, `teamMember`) VALUES
(39, 'To day I work on Telecome Projest...........', '14:00:00', '22:00:00', 8.00, '2026-07-04 09:18:36', '345672', 'Sunita Behera', 'Verified', 'Revised', NULL, '\n• n csnbzc msdz csdzschds', 'QA'),
(40, 'vsxvsmbxsM', '13:18:00', '16:18:00', 3.00, '2026-07-09 06:48:40', '345672', 'Sunita Behera', 'Pending', 'Verified', NULL, NULL, 'QC');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `emp_id` varchar(50) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `role` enum('Admin','MIS','TeamLead','TeamMember') DEFAULT NULL,
  `domain` varchar(100) DEFAULT NULL,
  `memberType` varchar(10) DEFAULT NULL,
  `totalExperience` varchar(50) DEFAULT NULL,
  `telecomExperience` varchar(50) DEFAULT NULL,
  `skillSets` text DEFAULT NULL,
  `region` varchar(100) DEFAULT NULL,
  `mobileNo` varchar(20) DEFAULT NULL,
  `lastExpUpdate` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `name`, `emp_id`, `email`, `password`, `role`, `domain`, `memberType`, `totalExperience`, `telecomExperience`, `skillSets`, `region`, `mobileNo`, `lastExpUpdate`) VALUES
(53, 'Ajaya Kumar Sahoo', '150093', 'ajay.sahoo@ecometrix.co.in', '$2b$10$EzaQ.gZgKiIk/i52LYimq.xxzFxRrj7FDQDllzVlVDAbkUBlFmxBm', 'Admin', '', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(54, 'Mrunmay Tripathy', '15M009', 'mrunmaya.tripathy@ecometrix.co.in', '$2b$10$kh5AwRkj6agXYot6ZLSrv.34c980kkOjlkZnUeQkZMi/sDLOQDRfC', 'Admin', '', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(55, 'S. Srinibash', '150632', 's.srinibash@ecometrix.co.in', '$2b$10$gUadGpS3mfmXUJVBYVqSAOMwCWGEB/zFIuTwIeYgfz4uylXCZw.5W', 'Admin', '', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(62, 'Mohana Ghosh Maulik', '150680', 'mohanaghosh.maulik@ecometrix.co.in', '$2b$10$BSIeata5NbkPa97gtl7czuc9N3adhAilCBQqyk7JADOHJaU5pRk3q', 'MIS', '', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(63, 'Sunita Behera', '150667', 'sunitabehera706484@ecometrix.co.in', '$2b$10$RwSLlNdZCJSzwAARTg17pe7.Gtta7m8d2ynIk79AGAb4CnvT264M2', 'TeamMember', 'F2', 'QA,QC', NULL, NULL, NULL, NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `work_updates`
--

CREATE TABLE `work_updates` (
  `id` int(11) NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `months` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`months`)),
  `domain` varchar(100) DEFAULT NULL,
  `sow` varchar(255) DEFAULT NULL,
  `job_type` varchar(255) DEFAULT NULL,
  `region` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `county` varchar(100) DEFAULT NULL,
  `uom` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`uom`)),
  `jobs_delivered` int(11) DEFAULT 0,
  `job_id` varchar(100) DEFAULT NULL,
  `current_status` varchar(100) DEFAULT NULL,
  `production_engineers` varchar(255) DEFAULT NULL,
  `qc_engineers` varchar(255) DEFAULT NULL,
  `otp` varchar(255) DEFAULT NULL,
  `internal_qc` varchar(255) DEFAULT NULL,
  `amdocs_qc` varchar(255) DEFAULT NULL,
  `receive_date` date DEFAULT NULL,
  `ecd_date` date DEFAULT NULL,
  `submission_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `capacity_forecast`
--
ALTER TABLE `capacity_forecast`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `job_creation`
--
ALTER TABLE `job_creation`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `jobId` (`jobId`),
  ADD UNIQUE KEY `unique_job_id` (`jobId`);

--
-- Indexes for table `master_data`
--
ALTER TABLE `master_data`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `timesheet_entries`
--
ALTER TABLE `timesheet_entries`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `emp_id` (`emp_id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `work_updates`
--
ALTER TABLE `work_updates`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_job_id` (`job_id`),
  ADD UNIQUE KEY `unique_work_job_id` (`job_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `capacity_forecast`
--
ALTER TABLE `capacity_forecast`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `job_creation`
--
ALTER TABLE `job_creation`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `master_data`
--
ALTER TABLE `master_data`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=45;

--
-- AUTO_INCREMENT for table `timesheet_entries`
--
ALTER TABLE `timesheet_entries`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=41;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=118;

--
-- AUTO_INCREMENT for table `work_updates`
--
ALTER TABLE `work_updates`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=300392;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
