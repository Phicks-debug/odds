# Perf budget

Budget (gzip, `dist/assets`): entry `index-*.js` <= 270 kB, every
chunk <= 280 kB. Entry is ~233 kB today, so both leave ~15% headroom
for dependency updates. Enforced by `bun run perf`, which fails CI.

Run: `bun run build && bun run perf`. The check reads `dist/assets/*.js|*.css`,
prints raw + gzip sizes, and exits 1 over budget.

What lazy-loads what (all on the CV-upload flow only):

- `CvUpload` component: `lazy()` in `SeekerQuestions` and `ProfilePage`.
- `cv-parse`: `import()` on first upload, in the parents' `onChange`.
- `cv-file`: `import()` when a file is chosen, inside `CvUpload`.
- `fflate`: `import()` when a Word file is chosen, inside `cv-file`.
- `pdfjs-dist` + worker: `import()` when a PDF is chosen (own chunk,
  ~431 kB raw / ~129 kB gzip; the ~1.2 MB worker `.mjs` is outside the
  budget on purpose, it loads only for PDFs).

Notes:

- Privacy unchanged: files are still read in the browser and never kept.
- No vendor `manualChunks`: tried, entry + vendor still load together,
  so initial bytes did not shrink. `chunkSizeWarningLimit` stays default.
- Data guards are separate and manual (need live Supabase):
  `bun scripts/check-cvs.ts`, `bun scripts/check-data.ts`.
