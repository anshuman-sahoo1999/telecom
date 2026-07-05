const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.argv[2] || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('Error: Please provide your NeonDB connection string.');
    console.error('Usage: node migrate.js <connection_string>');
    console.error('Example: node migrate.js postgresql://user:password@ep-host.aws.neon.tech/neondb?sslmode=require');
    process.exit(1);
  }

  console.log('Connecting to NeonDB...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected successfully!');

    // 1. Run Schema Setup
    console.log('Reading postgres_schema.sql...');
    const schemaPath = path.join(__dirname, 'config', 'postgres_schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at ${schemaPath}`);
    }
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Initializing PostgreSQL database schema...');
    // Split schema queries by semicolon and run them
    const schemaQueries = schemaSql
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0);

    for (let query of schemaQueries) {
      await client.query(query);
    }
    console.log('Schema initialized successfully!');

    // 2. Parse and load data from MySQL SQL file
    const sqlDumpPath = path.join(__dirname, '..', 'telecom_db.sql');
    console.log(`Reading MySQL data dump from ${sqlDumpPath}...`);
    if (!fs.existsSync(sqlDumpPath)) {
      throw new Error(`MySQL dump file not found at ${sqlDumpPath}`);
    }
    const mysqlSql = fs.readFileSync(sqlDumpPath, 'utf8');

    console.log('Parsing INSERT statements...');
    // Split by semicolons to isolate queries
    const blocks = mysqlSql.split(';');
    const insertQueries = [];

    for (let block of blocks) {
      let query = block.trim();
      if (/^INSERT INTO/i.test(query)) {
        // Clean up MySQL specific syntax for PostgreSQL
        query = query.replace(/`/g, '"');
        query = query.replace(/\\"/g, '"');
        
        insertQueries.push(query);
      }
    }

    console.log(`Found ${insertQueries.length} insert statements. Importing data...`);
    let count = 0;
    for (let query of insertQueries) {
      count++;
      process.stdout.write(`Executing insert ${count}/${insertQueries.length}...\r`);
      try {
        await client.query(query);
      } catch (err) {
        console.error(`\nError executing insert query: ${err.message}`);
        console.error('Query preview:', query.substring(0, 300) + '...');
        throw err;
      }
    }

    console.log(`\nImport complete! Successfully imported all data into NeonDB.`);

    // 3. Fix sequence IDs so Serial columns start from the correct auto-increment values
    console.log('Updating PostgreSQL sequence IDs...');
    const tables = ['job_creation', 'master_data', 'timesheet_entries', 'users', 'work_updates'];
    for (let table of tables) {
      const res = await client.query(`SELECT MAX(id) as max_id FROM "${table}"`);
      const maxId = res.rows[0].max_id;
      if (maxId) {
        const seqName = `${table}_id_seq`;
        await client.query(`SELECT setval('${seqName}', ${maxId})`);
        console.log(`Sequence for ${table} set to ${maxId}`);
      }
    }
    console.log('Sequences updated successfully.');

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
    console.log('Connection closed.');
  }
}

main();
