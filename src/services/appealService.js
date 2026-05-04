'use strict';

const express = require('express');
const XLSX    = require('xlsx');
const fs      = require('fs');
const path    = require('path');

const router      = express.Router();
const DATA_DIR    = path.join(__dirname, '..', '..', 'data');
const RECORDS_DIR = path.join(__dirname, '..', '..', 'records');
const APPEALS_FILE = path.join(DATA_DIR, 'grade-appeals.json');
const APPEALS_XLSX = path.join(RECORDS_DIR, 'Grade_Appeal_Tracker.xlsx');

if (!fs.existsSync(RECORDS_DIR)) fs.mkdirSync(RECORDS_DIR, { recursive: true });

// ─── Write all appeals to the persistent Excel file ──────────────────────────
function writeAppealsExcel(appeals) {
  const header = [
    '#', 'Date Submitted', 'Module Code', 'Module Name', 'Instructor',
    'Student ID', 'Student Name', 'Payment Confirmed', 'Status',
    'Initial CW', 'Initial Midterm', 'Initial Final', 'Initial Total', 'Initial Grade', 'Initial CGPA',
    'Updated CW', 'Updated Midterm', 'Updated Final', 'Updated Total', 'Updated Grade', 'Final CGPA',
    'Comments', 'Reviewed At'
  ];
  const rows = appeals.map((a, i) => [
    i + 1,
    new Date(a.submittedAt).toLocaleString('en-GB'),
    a.moduleCode,
    a.moduleName        || '',
    a.instructor        || '',
    a.studentId,
    a.studentName,
    a.paymentConfirmed ? 'Yes' : 'No',
    a.status,
    a.initialCoursework || '',
    a.initialMidterm    || '',
    a.initialFinal      || '',
    a.initialTotal      || '',
    a.initialGrade      || '',
    a.initialCGPA       || '',
    a.updatedCoursework || '',
    a.updatedMidterm    || '',
    a.updatedFinal      || '',
    a.updatedTotal      || '',
    a.updatedGrade      || '',
    a.finalCGPA         || '',
    a.comments          || '',
    a.reviewedAt ? new Date(a.reviewedAt).toLocaleString('en-GB') : ''
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [
    {wch:4},{wch:20},{wch:14},{wch:40},{wch:28},
    {wch:14},{wch:28},{wch:18},{wch:12},
    {wch:12},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12},
    {wch:12},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12},
    {wch:40},{wch:20}
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Grade Appeals');
  XLSX.writeFile(wb, APPEALS_XLSX);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get('/grade-appeals', (_req, res) => {
  if (!fs.existsSync(APPEALS_FILE)) return res.json([]);
  res.json(JSON.parse(fs.readFileSync(APPEALS_FILE)));
});

router.post('/grade-appeals', (req, res) => {
  const { moduleCode, moduleName, instructor, studentId, studentName, paymentConfirmed } = req.body;
  if (!moduleCode || !studentId || !studentName)
    return res.status(400).json({ error: 'moduleCode, studentId and studentName are required.' });

  const appeals = fs.existsSync(APPEALS_FILE) ? JSON.parse(fs.readFileSync(APPEALS_FILE)) : [];
  const appeal  = {
    id:               Date.now(),
    submittedAt:      new Date().toISOString(),
    moduleCode:       moduleCode.trim(),
    moduleName:       (moduleName || '').trim(),
    instructor:       (instructor || '').trim(),
    studentId:        studentId.trim(),
    studentName:      studentName.trim(),
    paymentConfirmed: !!paymentConfirmed,
    status:           'Pending'
  };
  appeals.push(appeal);
  fs.writeFileSync(APPEALS_FILE, JSON.stringify(appeals));
  writeAppealsExcel(appeals);
  console.log(`Grade appeal saved: ${appeal.studentId} – ${appeal.moduleCode}`);
  res.json({ ok: true, appeal });
});

router.get('/grade-appeals/download', (_req, res) => {
  if (!fs.existsSync(APPEALS_XLSX)) return res.status(404).json({ error: 'No data to download yet.' });
  res.download(APPEALS_XLSX, 'Grade_Appeal_Tracker.xlsx');
});

router.delete('/grade-appeals/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!fs.existsSync(APPEALS_FILE)) return res.status(404).json({ error: 'No appeals found.' });
  const appeals  = JSON.parse(fs.readFileSync(APPEALS_FILE));
  const filtered = appeals.filter(a => a.id !== id);
  if (filtered.length === appeals.length) return res.status(404).json({ error: 'Appeal not found.' });
  fs.writeFileSync(APPEALS_FILE, JSON.stringify(filtered));
  if (filtered.length) writeAppealsExcel(filtered);
  console.log(`Grade appeal deleted: id=${id}`);
  res.json({ ok: true });
});

router.put('/grade-appeals/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!fs.existsSync(APPEALS_FILE)) return res.status(404).json({ error: 'No appeals found.' });
  const appeals = JSON.parse(fs.readFileSync(APPEALS_FILE));
  const idx     = appeals.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Appeal not found.' });

  const {
    initialCoursework, initialMidterm, initialFinal, initialTotal, initialGrade, initialCGPA,
    updatedCoursework, updatedMidterm, updatedFinal, updatedTotal, updatedGrade, finalCGPA, comments
  } = req.body;

  appeals[idx] = {
    ...appeals[idx],
    initialCoursework: (initialCoursework || '').trim(),
    initialMidterm:    (initialMidterm    || '').trim(),
    initialFinal:      (initialFinal      || '').trim(),
    initialTotal:      (initialTotal      || '').trim(),
    initialGrade:      (initialGrade      || '').trim(),
    initialCGPA:       (initialCGPA       || '').trim(),
    updatedCoursework: (updatedCoursework || '').trim(),
    updatedMidterm:    (updatedMidterm    || '').trim(),
    updatedFinal:      (updatedFinal      || '').trim(),
    updatedTotal:      (updatedTotal      || '').trim(),
    updatedGrade:      (updatedGrade      || '').trim(),
    finalCGPA:         (finalCGPA         || '').trim(),
    comments:          (comments          || '').trim(),
    status:            'Complete',
    reviewedAt:        new Date().toISOString()
  };

  fs.writeFileSync(APPEALS_FILE, JSON.stringify(appeals));
  writeAppealsExcel(appeals);
  console.log(`Grade appeal reviewed: ${appeals[idx].studentId} – ${appeals[idx].moduleCode}`);
  res.json({ ok: true, appeal: appeals[idx] });
});

module.exports = router;
