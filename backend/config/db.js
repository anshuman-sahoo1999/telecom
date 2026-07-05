const { Pool } = require('pg');

// Create a PostgreSQL connection pool
// This will connect using DATABASE_URL (for NeonDB in production) or fallback to local postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/telecom_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Helper to translate MySQL query syntax and parameters to PostgreSQL
function translateQuery(sql, values) {
  let pgSql = sql;
  let pgValues = values ? [...values] : [];

  // 1. Handle MySQL placeholder ? -> PostgreSQL $1, $2, etc.
  // We check for bulk insert queries: INSERT INTO ... VALUES ?
  const bulkInsertRegex = /VALUES\s+\?/i;
  if (bulkInsertRegex.test(pgSql) && pgValues.length === 1 && Array.isArray(pgValues[0]) && Array.isArray(pgValues[0][0])) {
    const rows = pgValues[0];
    const valuePlaceholders = [];
    const flattenedValues = [];
    let paramIndex = 1;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const placeholders = [];
      for (let c = 0; c < row.length; c++) {
        placeholders.push(`$${paramIndex++}`);
        flattenedValues.push(row[c]);
      }
      valuePlaceholders.push(`(${placeholders.join(', ')})`);
    }

    pgSql = pgSql.replace(bulkInsertRegex, `VALUES ${valuePlaceholders.join(', ')}`);
    pgValues = flattenedValues;
  } else {
    // Standard placeholders: replace ? with $1, $2, $3, etc.
    let paramIndex = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
  }

  // 2. MySQL backticks (`) to PostgreSQL double quotes (")
  pgSql = pgSql.replace(/`/g, '"');

  // 3. PostgreSQL does not return the inserted ID by default unless RETURNING is specified.
  // If this is an INSERT statement, append "RETURNING *" to capture the inserted row.
  if (/^\s*INSERT\s+INTO/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
    pgSql += ' RETURNING *';
  }

  // 4. Translate MySQL-specific syntax (e.g. NOW() is supported, but if any others occur)
  // Let's replace MySQL timestamp/datetime updates if any specific patterns are found.

  return { sql: pgSql, values: pgValues };
}

const db = {
  query: (sql, params, callback) => {
    // Support two signatures: query(sql, params, callback) and query(sql, callback)
    let actualParams = params;
    let actualCallback = callback;
    
    if (typeof params === 'function') {
      actualCallback = params;
      actualParams = [];
    }

    const { sql: pgSql, values: pgValues } = translateQuery(sql, actualParams);

    pool.query(pgSql, pgValues, (err, res) => {
      if (err) {
        console.error('PostgreSQL query execution error:', err.message);
        console.error('Original SQL:', sql);
        console.error('Translated SQL:', pgSql);
        if (actualCallback) {
          // Format SQL error to match MySQL error structure if possible
          err.sqlMessage = err.message;
          actualCallback(err);
        }
        return;
      }

      // Format response to look like MySQL client result
      let result = [];
      if (res.rows) {
        result = [...res.rows];
      }

      // Populate MySQL-compatible result metadata (insertId and affectedRows)
      if (res.command === 'INSERT') {
        result.affectedRows = res.rowCount;
        if (res.rows && res.rows[0]) {
          const firstRow = res.rows[0];
          result.insertId = firstRow.id || firstRow.insertid || null;
        }
      } else if (res.command === 'UPDATE' || res.command === 'DELETE') {
        result.affectedRows = res.rowCount;
      }

      if (actualCallback) {
        actualCallback(null, result);
      }
    });
  },

  connect: (callback) => {
    pool.connect((err, client, release) => {
      if (err) {
        console.error('Database connection pool error:', err.message);
        if (callback) callback(err);
      } else {
        console.log('PostgreSQL Connected...');
        release();
        if (callback) callback(null);
      }
    });
  },

  pool: pool
};

module.exports = db;