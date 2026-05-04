# Academic Registration Management System
### Emirates Aviation University — Faculty of Engineering

A browser-based academic administration tool for managing student registrations, attendance, grading analysis, module tracking, and grade appeals for the Faculty of Engineering.

**Live site:** https://eaus310.github.io/Academic-Administration-Management-System---Emirates-Aviation-University/

---

## How It Works

The site runs entirely in your browser — there is no backend server, no database, no account.

1. Open the site in any modern browser.
2. Upload your `.xlsx` file (enrollment, grading, or attendance) via the **Upload** button on the relevant page.
3. The file is parsed in your browser using [SheetJS](https://sheetjs.com/) and the results are stored in your browser's **localStorage**.
4. All reports, filters, and Excel exports are generated client-side from that local data.

**Privacy:** Your uploaded data never leaves your browser. Nothing is sent to any server. Each user has their own local copy; data is not shared between users or devices.

---

## Features

### Attendance Tracking
- Upload and view attendance data from Excel
- Filter by program, module, and instructor
- Highlight students below attendance threshold
- Attendance Warning column shows 10%, 20%, or 25% warning percentage
- Spring Break (9–20 March) excluded from attendance and week number calculations
- PDF export with centred Warning column

### Grading Analysis
- Upload grading data (Excel workbook with grades + module metadata sheets)
- Two-row table format: raw counts + percentages per grade per module
- Calculates **(F + D + D+)%** adjusted for disciplinary and attendance warning students
- Highlights modules where (F+D+D+)% ≥ 20% in red
- Sorts by Program, then by descending (F+D+D+)%
- Shows Attendance Warning and Disciplinary counts per module
- Excel download of full grade analysis

### Academic Warning Report
- Parses WARNING_DATA sheet from the grading Excel file
- Cross-references student warning status with their module grades
- Blue header for student info columns; red header for Final Grades section
- Module names centred; student names wrap for readability
- Excel download of the full warning report

### Coursework Analysis
- Lists all modules with counts of students who failed each component
- **CW Fail**: students whose CW Gross mark is below a configurable slider threshold
- **Final Fail**: students whose Final Gross mark is below a configurable slider threshold
- **Overall Fail**: students with grade letter **F**
- Sliders update counts instantly (client-side aggregation)
- Sticky header on scroll; Excel download reflects current slider thresholds

### Detailed Module Grading
- Raw student-level grade data from the GRADES_DATA sheet
- Filterable by module; searchable by student name or ID
- Highlights attendance warning (orange) and disciplinary (purple) students

### Module Trackers
| Page | Description |
|------|-------------|
| **All Modules Tracker** | Section counts for all ENG/AME/AVI modules |
| **AME Module Tracker** | AME modules organised by semester (Semesters 1–5), highlights sections ≥ 28 |
| **All GEN Modules Tracker** | Section counts for all GEN-prefix modules |
| **All Math Module Tracker** | Section counts for MA-prefix and selected ENG math modules |

### Grade Appeals
- Log and track student grade appeal requests
- View, edit, and delete appeals
- Excel export of the appeal tracker

### Student Data
- Browse all registered students
- Filter and search by program or module

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla HTML / CSS / JavaScript |
| Excel parsing & export | [SheetJS](https://sheetjs.com/) (`xlsx`) loaded via CDN |
| Data storage | Browser `localStorage` (per-user) |
| Hosting | GitHub Pages |
| Deployment | GitHub Actions (`.github/workflows/deploy.yml`) |

No build step, no package manager required for use — just static files served from `public/`.

---

## Data Storage

All data lives in your browser's `localStorage` under keys prefixed `arms_`. The site automatically falls back to `sessionStorage` if `localStorage` is full.

| Key | Source upload |
|-----|---------------|
| `arms_students` | Enrollment Excel |
| `arms_attendance` | Attendance Excel (summary) |
| `arms_attendance_all` | Attendance Excel (full per-week) |
| `arms_modules` | Bundled at load (module reference data) |
| `arms_grades_raw` | Grading Excel (GRADES_DATA sheet) |
| `arms_grades_meta` | Grading Excel (MODULES_DATA sheet) |
| `arms_grades` | Computed grade analysis |
| `arms_grades_sheet` | Full grading sheet snapshot |
| `arms_warning_data` | Grading Excel (WARNING_DATA sheet) |
| `arms_grade_appeals` | Grade appeal log |

To reset all local data, clear the site's storage from your browser's developer tools (Application → Storage → Clear site data).

---

## Excel Upload Formats

### Grading File
A single `.xlsx` workbook with the following sheets:
- **GRADES_DATA:** Student-level grades — `MODULE`, `GRADE`, `FIRST NAME`, `SURNAME`, `ID NUMBER`, `20% ATTENDANCE`, `DISCIPLINARY ?`; super-header row with `Course work`, `Final Exam`, `Midterm Exam` group labels above `GROSS`/`NET` sub-columns
- **MODULES_DATA:** Module metadata — `CODE`, `MODULE`/`COURSE`, `PROGRAM`, `INSTRUCTOR`
- **WARNING_DATA:** Academic warning list — `S. NO`, `ID`, `STUDENTS FULL NAME`, `CR. HR.`, `CGPA`, `AW STATUS`, `COUNCIL DECISION`

### Attendance File
Standard attendance export with student ID, name, module, and attendance percentage columns.

### Enrollment File
MES (Module Enrollment Sheet) `.xlsx` workbook with one sheet per program: `EDAE`, `BSAE`, `AB & HD AME`, `Aerospace (AB & BEng)`, `Avionics (AB & BEng)`, `Mechanical (AB & BEng)`.

---

## Project Structure

```
├── public/                       # Deployed to GitHub Pages
│   ├── index.html                # Redirects to attendance.html
│   ├── attendance.html/js        # Attendance tracking
│   ├── grading.html/js           # Grading analysis
│   ├── warning-report.html/js    # Academic warning report
│   ├── coursework-analysis.html/js
│   ├── module-grading.html/js    # Detailed grading
│   ├── grade-appeal.html/js      # Grade appeal tracker
│   ├── all-data.html/js          # All attendance data
│   ├── ame-report.html/js
│   ├── other-report.html/js
│   ├── ame-module-tracker.html/js
│   ├── gen-module-tracker.html/js
│   ├── math-module-tracker.html/js
│   ├── module-sections.html/js
│   ├── modules-detail.html/js
│   ├── style.css
│   └── js/
│       ├── storage.js            # localStorage wrapper + bundled module data
│       ├── parser.js             # Client-side Excel parsing (SheetJS)
│       └── exporter.js           # Client-side Excel export (SheetJS)
├── .github/workflows/deploy.yml  # GitHub Pages deploy workflow
├── server.js                     # Legacy Express server (local dev only)
├── src/services/                 # Legacy server-side parsers
├── package.json
└── README.md
```

The `server.js` and `src/services/` are kept for optional local development with the original Express stack but are **not** required by the deployed site.

---

## Local Development (optional)

If you want to run the site against the legacy Express server (e.g. for testing the older API):

```bash
git clone https://github.com/EAUS310/Academic-Administration-Management-System---Emirates-Aviation-University.git
cd Academic-Administration-Management-System---Emirates-Aviation-University
npm install
npm start
```

Then open http://localhost:3000.

For the static version, just open `public/index.html` in your browser, or serve `public/` with any static file server (`python -m http.server`, VS Code Live Server, etc.).

---

## Deployment

Pushes to `main` automatically deploy to GitHub Pages via `.github/workflows/deploy.yml`. The workflow uploads only the `public/` directory; the legacy Express files are excluded.

---

## License

Internal use — Emirates Aviation University, Faculty of Engineering.
