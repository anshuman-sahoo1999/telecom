const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/telecom_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Database key mappings to restore camelCase and snake_case consistency on JavaScript objects
const KEY_MAPPINGS = {
  // job_id / jobId variations
  jobid: 'jobId',
  job_id: 'jobId',
  
  // Dates
  receivedate: 'receiveDate',
  receive_date: 'receiveDate',
  ecddate: 'ecdDate',
  ecd_date: 'ecdDate',
  submissiondate: 'submissionDate',
  submission_date: 'submissionDate',

  // QC fields
  internalqc: 'internalQc',
  internal_qc: 'internalQc',
  amdocsqc: 'amdocsQc',
  amdocs_qc: 'amdocsQc',

  // Other job fields
  markuprequired: 'markupRequired',
  isedited: 'isEdited',
  jobsdelivered: 'jobsDelivered',
  jobs_delivered: 'jobsDelivered',
  current_status: 'currentStatus',
  file_name: 'fileName',

  // Personnel fields
  employeename: 'employeeName',
  employeeName: 'employeeName',
  production_engineers: 'productionEngineers',
  qc_engineers: 'qcEngineers',
  teammember: 'teamMember',
  team_member: 'teamMember',

  // Timestamps / timesheets
  createdat: 'createdAt',
  created_at: 'createdAt',
  updatedat: 'updatedAt',
  updated_at: 'updatedAt',
  starttime: 'startTime',
  start_time: 'startTime',
  endtime: 'endTime',
  end_time: 'endTime',

  // Status & reasons
  tlstatus: 'tlStatus',
  tl_status: 'tlStatus',
  adminstatus: 'adminStatus',
  admin_status: 'adminStatus',
  tlrevisedreason: 'tlRevisedReason',
  tl_revised_reason: 'tlRevisedReason',
  adminrevisedreason: 'adminRevisedReason',
  admin_revised_reason: 'adminRevisedReason',

  // User fields
  emp_id: 'emp_id',
  membertype: 'memberType',
  member_type: 'memberType',
  totalexperience: 'totalExperience',
  total_experience: 'totalExperience',
  telecomexperience: 'telecomExperience',
  telecom_experience: 'telecomExperience',
  skillsets: 'skillSets',
  skill_sets: 'skillSets',
  mobileno: 'mobileNo',
  mobile_no: 'mobileNo',
  lastexpupdate: 'lastExpUpdate',
  last_exp_update: 'lastExpUpdate',

  // Master data & others
  subdomain: 'subDomain',
  sub_domain: 'subDomain',
  job_type: 'jobType',
  jobtype: 'jobType'
};

function mapRowKeys(row) {
  if (!row) return row;
  const mapped = {};
  for (let key of Object.keys(row)) {
    const lowerKey = key.toLowerCase();
    const mappedKey = KEY_MAPPINGS[key] || KEY_MAPPINGS[lowerKey] || key;
    mapped[mappedKey] = row[key];
  }
  return mapped;
}

function translateQuery(sql, values) {
  let pgSql = sql;
  let pgValues = values ? [...values] : [];

  // 1. Handle MySQL bulk insert or parameter placeholder replacement (? -> $1, $2...)
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

  // 2. MySQL backticks (`) -> Strip them completely so Postgres handles unquoted columns properly
  pgSql = pgSql.replace(/`/g, '');

  // 3. PostgreSQL INSERT returning clause addition if missing
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

      // Map keys to camelCase / expected keys to match controller expectations
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
