module.exports = {
  apps: [
    {
      name: "clawchat-server",
      script: "./dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        SERVER_PORT: 3001,
        OPENCLAW_API_URL: "http://localhost:18789/v1/chat/completions",
        OPENCLAW_API_TOKEN: "",
      },
    },
  ],
};
