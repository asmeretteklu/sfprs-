const bcrypt = require('./services/auth-service/node_modules/bcrypt');
const mysql = require('./services/auth-service/node_modules/mysql2/promise');

async function test() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'LoveTigray@2026!!!!',
    database: 'sfprs_db'
  });
  const [rows] = await connection.query('SELECT email, password_hash, is_active, deleted_at FROM users WHERE email = ?', ['admin@microlink.edu.et']);
  console.log('User found in DB:', rows);
  if (rows.length > 0) {
    const match = await bcrypt.compare('Admin@Microlink2025', rows[0].password_hash);
    console.log('Password match:', match);
  } else {
    console.log('User not found in DB!');
  }
  await connection.end();
}
test().catch(console.error);
