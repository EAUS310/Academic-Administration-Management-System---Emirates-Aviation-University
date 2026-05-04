'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = 3000;

// ─── Ensure data directory exists ────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', require('./src/services/studentService'));
app.use('/api', require('./src/services/attendanceService'));
app.use('/api', require('./src/services/gradingService'));
app.use('/api', require('./src/services/appealService'));
app.use('/api', require('./src/services/moduleService'));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`\n  http://localhost:${PORT}\n`));
