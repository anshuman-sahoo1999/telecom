const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/telecom_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Database key mappings to restore camelCase names on Javascript objects
const KEY_MAPPINGS = {
  jobid: 'jobId',
  receivedate: 'receiveDate',
  ecddate: 'ecdDate',
  submissiondate: 'submissionDate',
  internalqc: 'internalQc',
  amdocsqc: 'amdocsQc',
  markuprequired: 'markupRequired',
  isedited: 'isEdited',
  employeename: 'employeeName',
  createdat: 'createdAt',
  updatedat: 'updatedAt',
  starttime: 'startTime',
  endtime: 'endTime',
  tlstatus: 'tlStatus',
  adminstatus: 'adminStatus',
  tlrevisedreason: 'tlRevisedReason',
  adminrevisedreason: 'adminRevisedReason',
  teammember: 'teamMember',
  emp_id: 'emp_id',
  membertype: 'memberType',
  totalexperience: 'totalExperience',
  telecomexperience: 'telecomExperience',
  skillsets: 'skillSets',
  mobileno: 'mobileNo',
  lastexpupdate: 'lastExpUpdate',
  jobsdelivered: 'jobsDelivered',
  subdomain: 'subDomain'
};

function mapRowKeys(row) {
  if (!row) return row;
  const mapped = {};
  for (let key of Object.keys(row)) {
    const mappedKey = KEY_MAPPINGS[key] || key;
    mapped[mappedKey] = row[key];
  }
  return mapped;
}

function translateQuery(sql, values) {
  let pgSql = sql;
  let pgValues = values ? [...values] : [];

  // 1. Handle MySQL placeholder ? -> PostgreSQL $1, $2, etc.
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
    let paramIndex = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
  }

  // 2. MySQL backticks (`) -> Strip them completely so PG resolves unquoted columns to lowercase
  pgSql = pgSql.replace(/`/g, '');

  // 3. PostgreSQL INSERT returning clause
  if (/^\s*INSERT\s+INTO/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
    pgSql += ' RETURNING *';
  }

  return { sql: pgSql, values: pgValues };
}

const db = {
  query: (sql, params, callback) => {
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
          err.sqlMessage = err.message;
          actualCallback(err);
        }
        return;
      }

      // Map keys to camelCase to match MySQL controller expectations
      let result = [];
      if (res.rows) {
        result = res.rows.map(row => mapRowKeys(row));
      }

      if (res.command === 'INSERT') {
        result.affectedRows = res.rowCount;
        if (res.rows && res.rows[0]) {
          const firstRow = mapRowKeys(res.rows[0]);
          result.insertId = firstRow.id || null;
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