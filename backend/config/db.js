require('dotenv').config();

const defaultNeonUrl = 'postgresql://neondb_owner:npg_UksnzaI1b8Bc@ep-royal-pond-atxwucsp-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';

const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || defaultNeonUrl;

let isPostgres = false;
if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
  isPostgres = true;
}

if (isPostgres) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  pool.on('error', (err) => {
    console.error('Unexpected NeonDB pool error:', err.message);
  });

  const db = {
    query: (sql, params, callback) => {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      params = params || [];

      // Clean MySQL backticks for PostgreSQL
      let pgSql = sql.replace(/`/g, '');

      // Convert MySQL JSON_ARRAY to Postgres json_build_array
      pgSql = pgSql.replace(/JSON_ARRAY\(/gi, 'json_build_array(');

      // Only replace ? with $1, $2... if ? is present in query
      if (pgSql.includes('?')) {
        let paramIndex = 1;
        pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
      }

      // Append RETURNING id only for simple single INSERT queries (not ON CONFLICT or multi-statement)
      const isInsert = /^\s*INSERT\s+INTO/i.test(pgSql);
      if (isInsert && !/RETURNING/i.test(pgSql) && !/ON CONFLICT/i.test(pgSql) && !pgSql.includes(';')) {
        pgSql += ' RETURNING id';
      }

      pool.query(pgSql, params, (err, res) => {
        if (err) {
          console.error('NeonDB Query Error:', err.message, 'SQL snippet:', pgSql.slice(0, 100));
          if (callback) return callback(err, null);
          return;
        }
        const rawRows = res ? (res.rows || []) : [];
        const results = rawRows.map(row => {
          if (!row || typeof row !== 'object') return row;
          return {
            ...row,
            memberType: row.membertype ?? row.memberType,
            totalExperience: row.totalexperience ?? row.totalExperience,
            telecomExperience: row.telecomexperience ?? row.telecomExperience,
            skillSets: row.skillsets ?? row.skillSets,
            mobileNo: row.mobileno ?? row.mobileNo,
            lastExpUpdate: row.lastexpupdate ?? row.lastExpUpdate,
            jobId: row.jobid ?? row.jobId,
            receiveDate: row.receivedate ?? row.receiveDate,
            ecdDate: row.ecddate ?? row.ecdDate,
            submissionDate: row.submissiondate ?? row.submissionDate,
            internalQc: row.internalqc ?? row.internalQc,
            amdocsQc: row.amdocsqc ?? row.amdocsQc,
            jobType: row.jobtype ?? row.jobType,
            startTime: row.starttime ?? row.startTime,
            endTime: row.endtime ?? row.endTime,
            employeeName: row.employeename ?? row.employeeName,
            tlStatus: row.tlstatus ?? row.tlStatus,
            adminStatus: row.adminstatus ?? row.adminStatus,
            tlRevisedReason: row.tlrevisedreason ?? row.tlRevisedReason,
            adminRevisedReason: row.adminrevisedreason ?? row.adminRevisedReason,
            teamMember: row.teammember ?? row.teamMember
          };
        });

        if (res) {
          results.affectedRows = res.rowCount;
          if (res.rows && res.rows.length > 0 && res.rows[0].id !== undefined) {
            results.insertId = res.rows[0].id;
          }
        }
        if (callback) return callback(null, results);
      });
    },
    connect: (cb) => {
      if (cb) cb(null);
    }
  };

  module.exports = db;
} else {
  const mysql = require('mysql2');

  const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'telecom_db'
  });

  db.connect((err) => {
    if (err) {
      console.log('DB Connection Error:', err.message);
    } else {
      console.log('MySQL Connected...');
    }
  });

  module.exports = db;
}