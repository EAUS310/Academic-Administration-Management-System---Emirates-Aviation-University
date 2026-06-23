# CLAUDE.md — Academic Registration Management System

## Project Overview
Internal academic administration tool for Emirates Aviation University, Faculty of Engineering (FOE). Manages student registration, attendance tracking, module tracking, grade appeals, and schedule extraction.

It is a **static, browser-only site** — no backend server, no database, no accounts. Excel/PDF files are uploaded and parsed entirely in the browser; results are stored in the browser's `localStorage` (keys prefixed `arms_`). Each user has their own local copy; nothing is sent to a server.

> Grading Analysis, Academic Warning Report, Coursework Analysis, and Detailed Module Grading have been **moved to a separate project** and removed from this tool.

## Tech Stack
- **Frontend**: Vanilla HTML / CSS / JS (no build step)
- **Excel parsing & export**: [SheetJS](https://sheetjs.com/) (`xlsx`), loaded via CDN
- **Data storage**: browser `localStorage` (falls back to `sessionStorage` when full)
- **Hosting**: GitHub Pages — deploys `public/` only
- **Deployment**: GitHub Actions (`.github/workflows/deploy.yml`) on push to `main`

**Live site:** https://eaus310.github.io/Academic-Administration-Management-System---Emirates-Aviation-University/

## Key File Paths
| Path | Purpose |
|------|---------|
| `public/` | The deployed site — all HTML pages + companion JS |
| `public/index.html` | Redirects to `attendance.html` |
| `public/js/storage.js` | `localStorage` wrapper + bundled module reference data |
| `public/js/parser.js` | Client-side Excel parsing (SheetJS) |
| `public/js/exporter.js` | Client-side Excel export (SheetJS) |
| `public/style.css` | Shared styles |
| `.github/workflows/deploy.yml` | GitHub Pages deploy workflow |
| `server.js`, `src/services/` | **Legacy** Express server + parsers — not used by the deployed site, kept for optional local dev only |
| `schedule-mailer/` | Standalone Node scripts (run locally, not deployed) — split the master schedule PDF into one PDF per student, render images, and build CSV/XLSX manifests (uses `pdf-lib`; expects a `pages.txt` sidecar from `pdftotext -layout`) |

## Pages (in `public/`)
| Page | Purpose |
|------|---------|
| `attendance.html` | Attendance tracking — filter by program/module/instructor, flag below-threshold students, PDF export |
| `all-data.html` | Full per-week attendance data |
| `attendance-push.html` | Attendance push view |
| `ame-report.html` / `other-report.html` | Program-specific attendance reports |
| `ame-module-tracker.html` | AME modules by semester (1–5), highlights sections ≥ 28 |
| `gen-module-tracker.html` | GEN-prefix module section counts |
| `math-module-tracker.html` | MA-prefix + selected ENG math module counts |
| `module-sections.html` / `modules-detail.html` | Module/section queries |
| `grade-appeal.html` | Grade appeal tracker — CRUD + Excel export |
| `schedule-extractor.html` | Splits a combined aSc timetable PDF (one student/page) into one renamed `<ID>.pdf` per student + ZIP and CSV/XLSX manifest, all in-browser |

## Data Flow
1. Staff open a page and upload an `.xlsx` (or PDF) file via the **Upload** button.
2. The file is parsed in the browser (SheetJS / pdf-lib) — nothing is sent to a server.
3. Parsed data is written to `localStorage` under `arms_*` keys.
4. Report pages read from `localStorage` and render / export results client-side.

### localStorage keys
`arms_students`, `arms_attendance`, `arms_attendance_all`, `arms_modules` (bundled), `arms_grade_appeals`. (Reset via the browser's Application → Storage → Clear site data.)

## Local Development
No server needed — open `public/index.html` directly, or serve `public/` with any static server (`python -m http.server`, VS Code Live Server, etc.). `npm install && npm start` only runs the **legacy** Express stack on port 3000 and is not required.

## Semester Constants (Summer 2026)
- Semester start: 08 Jun 2026
- No mid-semester break (Summer term)
- Attendance warning threshold: **<25%** for all programs (including AME)
