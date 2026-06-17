const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database/db');
const initTables = require('./database/init');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3011;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', apiRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '水产养殖用药记录系统后端服务运行正常' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: '服务器内部错误' });
});

async function start() {
  console.log('正在初始化数据库...');
  await initDatabase();
  await initTables();
  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`  水产养殖用药记录系统 - 后端服务`);
    console.log(`  服务地址: http://localhost:${PORT}`);
    console.log(`  健康检查: http://localhost:${PORT}/health`);
    console.log(`  API前缀:   http://localhost:${PORT}/api`);
    console.log(`========================================`);
  });
}

start().catch(console.error);
