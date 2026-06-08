module.exports = {
  apps: [
    {
      name: "auth-service",
      script: "./src/index.js",
      cwd: "./services/auth-service"
    },
    {
      name: "finance-service",
      script: "./src/index.js",
      cwd: "./services/finance-service"
    },
    {
      name: "notification-service",
      script: "./src/index.js",
      cwd: "./services/notification-service"
    },
    {
      name: "report-service",
      script: "./src/index.js",
      cwd: "./services/report-service"
    },
    {
      name: "student-service",
      script: "./src/index.js",
      cwd: "./services/student-service"
    },
    {
      name: "frontend",
      script: "./frontend-server.js",
      cwd: "./"
    }
  ]
};
