# Project Standard Operating Procedure (SOP)

## Architecture Amendment Protocol

Whenever the user says **"Implement architecture amendments"**, follow these steps **in order**:

---

### Step 1 — Create/Update `.claudeignore`

Include the following to save tokens:

```
node_modules/
dist/
build/
.env
*.env.*
*.log
*.map
*.min.js
*.min.css
assets/images/
assets/videos/
```

---

### Step 2 — Create/Update `CLAUDE.md`

Summarize the following so the project does not need to be fully scanned each session:

- **Project name and purpose**
- **Tech stack** (frameworks, libraries, build tools)
- **Key file paths** (entry points, config files, main components, services)
- **Hosting setup** (e.g., GitHub Pages, base path, deploy target)

---

### Step 3 — Modularize Structure

Reorganize code into a clean structure:

| Content Type         | Target Directory        |
|----------------------|-------------------------|
| Business logic       | `/src/services/`        |
| UI components        | `/src/components/`      |
| Production builds    | `/docs/`                |

> `/docs` is used for GitHub Pages compatibility.

---

### Step 4 — Update Imports

After moving files, automatically fix **all** `import` and `require` paths across the entire codebase to reflect the new directory structure. Do not leave any broken references.

---

### Step 5 — Verification

Confirm the following before marking the task complete:

- [ ] The app still **builds successfully**
- [ ] The **`base` path** in the config (e.g., `vite.config.js`, `next.config.js`) matches the GitHub repository name
- [ ] All pages/routes resolve correctly under the new structure
- [ ] No dead imports or missing files remain

---

*This SOP was created to ensure consistent, repeatable architecture optimizations across all sessions.*
