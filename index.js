require('dotenv').config();
const { start } = require('./src/app');
start().catch(err => { console.error('[fatal]', err.message); process.exitCode = 1; });
