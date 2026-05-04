'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const router    = express.Router();
const DATA_DIR  = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'students.json');

// ─── Routes ──────────────────────────────────────────────────────────────────

// All ENG/AME/AVI modules (excludes GEN, FDN, MA, IND; whitelists select ENG codes)
router.get('/module-sections', (_req, res) => {
  if (!fs.existsSync(DATA_FILE)) return res.json({ noData: true });
  const { students } = JSON.parse(fs.readFileSync(DATA_FILE));

  const EXCLUDE_TAB   = 'AB & HD AME';
  const SKIP_PREFIXES = ['GEN', 'FDN', 'MA', 'IND'];
  const ENG_WHITELIST = new Set(['ENG1000', 'ENG1100', 'ENG1200', 'ENG3250', 'ENG3260', 'ENG2220']);

  const moduleMap = {};
  for (const student of students) {
    if (student.programTab === EXCLUDE_TAB) continue;
    for (const mod of student.modules) {
      const codeUpper = mod.code.toUpperCase();
      if (SKIP_PREFIXES.some(p => codeUpper.startsWith(p))) continue;
      if (codeUpper.startsWith('ENG') && !ENG_WHITELIST.has(codeUpper)) continue;
      if (!moduleMap[mod.code]) moduleMap[mod.code] = { code: mod.code, name: mod.name, sections: {} };
      moduleMap[mod.code].sections[mod.section] = (moduleMap[mod.code].sections[mod.section] || 0) + 1;
    }
  }

  const allSections = new Set();
  for (const m of Object.values(moduleMap))
    for (const s of Object.keys(m.sections)) allSections.add(parseInt(s));

  const sections = Array.from(allSections).sort((a, b) => a - b);
  const modules  = Object.values(moduleMap)
    .map(m => ({ ...m, total: sections.reduce((s, sec) => s + (m.sections[sec] || 0), 0) }))
    .sort((a, b) => a.code.localeCompare(b.code));

  res.json({ sections, modules });
});

// AME-only modules
router.get('/ame-module-sections', (_req, res) => {
  if (!fs.existsSync(DATA_FILE)) return res.json({ noData: true });
  const { students } = JSON.parse(fs.readFileSync(DATA_FILE));
  const SKIP_PREFIXES = ['FDN', 'GEN'];

  const filtered = students.filter(s => s.programTab === 'AB & HD AME');
  const moduleMap = {};
  for (const student of filtered) {
    for (const mod of student.modules) {
      if (SKIP_PREFIXES.some(p => mod.code.toUpperCase().startsWith(p))) continue;
      if (!moduleMap[mod.code]) moduleMap[mod.code] = { code: mod.code, name: mod.name, sections: {} };
      moduleMap[mod.code].sections[mod.section] = (moduleMap[mod.code].sections[mod.section] || 0) + 1;
    }
  }

  const allSections = new Set();
  for (const m of Object.values(moduleMap))
    for (const s of Object.keys(m.sections)) allSections.add(parseInt(s));

  const sections = Array.from(allSections).sort((a, b) => a - b);
  const modules  = Object.values(moduleMap)
    .map(m => ({ ...m, total: sections.reduce((s, sec) => s + (m.sections[sec] || 0), 0) }))
    .sort((a, b) => a.code.localeCompare(b.code));

  res.json({ sections, modules });
});

// GEN modules only
router.get('/gen-module-sections', (_req, res) => {
  if (!fs.existsSync(DATA_FILE)) return res.json({ noData: true });
  const { students } = JSON.parse(fs.readFileSync(DATA_FILE));

  const moduleMap = {};
  for (const student of students) {
    for (const mod of student.modules) {
      if (!mod.code.toUpperCase().startsWith('GEN')) continue;
      if (!moduleMap[mod.code]) moduleMap[mod.code] = { code: mod.code, name: mod.name, sections: {} };
      moduleMap[mod.code].sections[mod.section] = (moduleMap[mod.code].sections[mod.section] || 0) + 1;
    }
  }

  const allSections = new Set();
  for (const m of Object.values(moduleMap))
    for (const s of Object.keys(m.sections)) allSections.add(parseInt(s));

  const sections = Array.from(allSections).sort((a, b) => a - b);
  const modules  = Object.values(moduleMap)
    .map(m => ({ ...m, total: sections.reduce((s, sec) => s + (m.sections[sec] || 0), 0) }))
    .sort((a, b) => a.code.localeCompare(b.code));

  res.json({ sections, modules });
});

// MA-prefix + whitelisted ENG math modules
router.get('/math-module-sections', (_req, res) => {
  if (!fs.existsSync(DATA_FILE)) return res.json({ noData: true });
  const { students } = JSON.parse(fs.readFileSync(DATA_FILE));
  const MATH_ENG = new Set(['ENG1000', 'ENG1100', 'ENG1200', 'ENG3250', 'ENG3260', 'ENG2220']);

  const moduleMap = {};
  for (const student of students) {
    for (const mod of student.modules) {
      const codeUpper = mod.code.toUpperCase();
      if (!codeUpper.startsWith('MA') && !MATH_ENG.has(codeUpper)) continue;
      if (!moduleMap[mod.code]) moduleMap[mod.code] = { code: mod.code, name: mod.name, sections: {} };
      moduleMap[mod.code].sections[mod.section] = (moduleMap[mod.code].sections[mod.section] || 0) + 1;
    }
  }

  const allSections = new Set();
  for (const m of Object.values(moduleMap))
    for (const s of Object.keys(m.sections)) allSections.add(parseInt(s));

  const sections = Array.from(allSections).sort((a, b) => a - b);
  const modules  = Object.values(moduleMap)
    .map(m => ({ ...m, total: sections.reduce((s, sec) => s + (m.sections[sec] || 0), 0) }))
    .sort((a, b) => a.code.localeCompare(b.code));

  res.json({ sections, modules });
});

module.exports = router;
