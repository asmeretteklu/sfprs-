const fs = require('fs');
const mysql = require('mysql2/promise');
const path = require('path');

async function initDB() {
  console.log("Connecting to MySQL...");
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'LoveTigray@2026!!!!',
    multipleStatements: true
  });

  const schemaPath = path.join(__dirname, '../../database/schema.sql');
  console.log("Reading schema.sql from", schemaPath);
  const schema = fs.readFileSync(schemaPath, 'utf8');
  console.log("Executing schema.sql...");
  await connection.query(schema);
  console.log("Schema created successfully.");

  const seedPath = path.join(__dirname, '../../database/seed.sql');
  console.log("Reading seed.sql from", seedPath);
  const seed = fs.readFileSync(seedPath, 'utf8');
  console.log("Executing seed.sql...");
  await connection.query(seed);
  console.log("Seed data inserted successfully.");

  await connection.end();
  console.log("Database initialization complete!");
}

initDB().catch(err => {
  console.error("Failed to initialize DB:", err);
  process.exit(1);
});
