const fs = require('fs');
const mysql = require('mysql2/promise');
const path = require('path');

async function runMigration() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'LoveTigray@2026!!!!',
    database: 'sfprs_db',
    multipleStatements: true
  });

  const sqlPath = path.join(__dirname, 'migrations', '002_security_hardening.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    console.log('Running migration...');
    await connection.query(sql);
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await connection.end();
  }
}

runMigration();
