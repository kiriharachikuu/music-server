// XingTone后端 - PM2 进程配置
// 启动：pm2 start ecosystem.config.js
// 重启：pm2 restart xtmusic-backend
module.exports = {
  apps: [
    {
      name: 'xtmusic-backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
