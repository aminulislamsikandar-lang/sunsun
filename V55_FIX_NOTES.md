# V55 Fix Package

## Fixes applied
1. Fixed the malformed `/api/admin/hostel/reports` route in `server/src/server.js`.
   - Corrected the `res.json()` / route closing structure.
2. Restored the missing legacy `requireStudent` middleware before the legacy student routes.
   - Uses the existing JWT student token.
   - Requires `role === "student"`.
   - Verifies both the student account and linked active student record.
   - Sets `req.student` to the actual student record so legacy routes using `req.student.id` continue to work.
3. Kept the existing `requireStudentV44` authentication middleware unchanged.

## Validation performed
- `node --check server/src/server.js` — PASS
- `node --check scripts/smoke-v53.mjs` — PASS
- Active server syntax is clean.

## After extracting
Run:
```cmd
npm install
npm run install:all
npm run build
node --check ".\server\src\server.js"
npm run start
```
Then, in a second terminal:
```cmd
npm run smoke
```

Do not run `npm audit fix --force` unless dependency upgrades are intentionally reviewed, because it may introduce breaking changes.

Note: the `UPGRADE_BACKUP_*` folders are historical snapshots and were intentionally preserved; they are not used by the active `start`, `build`, or `smoke` scripts.
