module.exports = {
  apps: [
    {
      name: 'zyra',
      cwd: __dirname,
      script: 'dist/index.js',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      time: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
        WA_ANTIBAN_ENABLED: 'true',
        WA_ANTIBAN_DEAF_SESSION_ENABLED: 'true',
        WA_ANTIBAN_DEAF_SESSION_TIMEOUT_MS: '300000',
        WA_ANTIBAN_DEAF_SESSION_MIN_UPTIME_MS: '120000',
        WA_ANTIBAN_DEAF_SESSION_AUTO_RECONNECT: 'true',
        WA_ANTIBAN_METRICS_ENABLED: 'true',
        WA_ANTIBAN_METRICS_HOST: '0.0.0.0',
        WA_ANTIBAN_METRICS_PORT: '9108',
        WA_ANTIBAN_METRICS_PATH: '/metrics',
      },
    },
  ],
}
