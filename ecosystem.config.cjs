const path = require("path");
const dotenv = require("dotenv");

const root = __dirname;
dotenv.config({ path: path.join(root, ".env") });
const env = { ...process.env, NODE_ENV: "production" };

module.exports = {
  apps: [
    {
      name: "x402-server",
      script: "server/src/index.js",
      cwd: root,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        ...env,
        FX_API_PORT: env.FX_API_PORT || "4021",
        FX_API_URL: env.FX_API_URL || "http://127.0.0.1:4021",
      },
    },
    {
      name: "x402-agent",
      script: "agent/src/index.js",
      cwd: root,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        ...env,
        AGENT_PORT: env.AGENT_PORT || "3005",
        FX_API_URL: env.FX_API_URL || "http://127.0.0.1:4021",
      },
    },
    {
      name: "x402-client",
      script: "node_modules/serve/build/main.js",
      args: ["-s", "client/dist", "-l", env.CLIENT_PORT || "5174"],
      cwd: root,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "150M",
      env: { ...env, NODE_ENV: "production" },
    },
  ],
};
