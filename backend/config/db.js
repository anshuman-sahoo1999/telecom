require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL;

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

  pool.connect((err, client, release) => {
    if (err) {
      console.error('NeonDB (PostgreSQL) Connection Error:', err.message);
    } else {
      console.log('NeonDB (PostgreSQL) Connected successfully!');
      if (release) release();
    }
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

      // Replace ? placeholders with $1, $2, $3 ...
      let paramIndex = 1;
      pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);

      // Append RETURNING id for INSERT queries if not present
      const isInsert = /^\s*INSERT\s+INTO/i.test(pgSql);
      if (isInsert && !/RETURNING/i.test(pgSql)) {
        pgSql += ' RETURNING id';
      }

      pool.query(pgSql, params, (err, res) => {
        if (err) {
          if (callback) return callback(err, null);
          return;
        }
        const results = res ? (res.rows || []) : [];
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