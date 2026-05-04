# CLAUDE.md — Academic Registration Management System

## Project Overview
Faculty of Engineering (FOE) internal web tool for managing student registration, attendance tracking, grading analysis, and grade appeals. Runs as a local Express server — not a public-facing app.

## Tech Stack
- **Runtime**: Node.js with Express 5
- **Excel parsing**: `xlsx` + `exceljs` (for exports)
- **File uploads**: `multer` (memory storage)
- **Frontend**: Vanilla HTML / CSS / JS (no build step)
- **Served by**: `express.static` from `public/`

## Key File Paths
| Path | Purpose |
|------|---------|
| `server.js` | Thin entry point — middleware + route mounting |
| `src/services/utils.js` | Shared `clean()` / `colOf()` helpers |
| `src/services/studentService.js` | Upload enrollment Excel, search/status |
| `src/services/attendanceService.js` | Upload attendance, warnings, all-data |
| `src/services/gradingService.js` | Upload grades, analysis, warnings, downloads |
| `src/services/appealService.js` | Grade appeal CRUD + Excel export |
| `src/services/moduleService.js` | Module-section queries (ENG/AME/GEN/MATH) |
| `data/` | JSON data files written at upload time |
| `records/` | Persistent Excel exports (Grade_Appeal_Tracker.xlsx) |
| `public/` | All HTML pages + their companion JS files |

## Hosting
Local Express server on port 3000 (`npm start`). No GitHub Pages or build step.

## Data Flow
1. Staff upload an Excel workbook via a page in `public/`
2. The relevant API endpoint (in `src/services/`) parses it and writes JSON to `data/`
3. Report pages fetch from the API and render results client-side

## Semester Constants (Spring 2026)
- Semester start: 19 Jan 2026
- Spring Break: 9–20 Mar 2026 (14 days, excluded from attendance calculations)
