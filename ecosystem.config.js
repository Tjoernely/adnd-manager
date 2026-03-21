/**
 * PM2 ecosystem config — single source of truth for the backend process.
 * Usage on server: pm2 start ecosystem.config.js
 * Deploy uses this so cwd, env, and process name are always consistent.
 */
module.exports = {
  apps: [
    {
      name:          'adnd-backend',
      script:        './server/index.js',
      cwd:           '/var/www/adnd-manager',
      env: {
        NODE_ENV: 'production',
        PORT:     3001,
      },
      watch:         false,
      max_restarts:  5,
      restart_delay: 3000,
      kill_timeout:  5000,
    },
  ],
};
