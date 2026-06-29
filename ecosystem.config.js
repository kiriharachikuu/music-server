// XingTone后端 - PM2 进程配置
// 启动：pm2 start ecosystem.config.js
// 重启：pm2 restart xtmusic-backend --update-env
// 注意：修改环境变量后必须加 --update-env，否则 PM2 会缓存旧 env
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
        // 跨域白名单：因后端 credentials=true，不能用 *，必须列出具体域名
        CORS_ORIGINS:
          'http://localhost:3000,http://localhost:3001,http://localhost:3002,https://xtmusic.chikuu.top,https://xtmusicadmin.chikuu.top',
      },
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
