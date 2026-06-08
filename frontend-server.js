const express = require('./services/auth-service/node_modules/express');
const path = require('path');

const app = express();

// Serve the client directory as static files under /client
app.use('/client', express.static(path.join(__dirname, 'client')));

// Fallback to login.html for the root route
app.get('/', (req, res) => {
  res.redirect('/client/login.html');
});

const PORT = 5500;
app.listen(PORT, () => {
  console.log(`Frontend is running on http://localhost:${PORT}`);
});
