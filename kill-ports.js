const { execSync } = require('child_process');

const ports = [3001, 3002, 3003, 3004, 3005, 5500];

ports.forEach(port => {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`).toString();
    const lines = output.split('\n');
    lines.forEach(line => {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          console.log(`Killing process ${pid} on port ${port}`);
          try {
            execSync(`taskkill /F /PID ${pid}`);
          } catch(err) {}
        }
      }
    });
  } catch (e) {
    // ignore
  }
});
console.log("Cleanup complete!");
