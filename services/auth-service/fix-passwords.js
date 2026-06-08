const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

async function fixPasswords() {
  console.log('Generating hash...');
  const hash = await bcrypt.hash('Admin@Microlink2025', 12);
  
  console.log('Connecting to DB...');
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'LoveTigray@2026!!!!',
    database: 'sfprs_db'
  });
  
  console.log('Updating passwords...');
  await connection.query('UPDATE users SET password_hash = ?', [hash]);
  
  console.log('Passwords fixed successfully!');
  await connection.end();
}

fixPasswords().catch(console.error);
