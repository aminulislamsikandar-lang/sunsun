# V53 — Reliability, QA & Recovery Confidence

V53 focuses on making the existing system safer to run and easier to verify.

## Added
- Dependency-free backend reliability report
- Public release/version endpoint
- No-dependency Node smoke test runner
- Optional authenticated admin smoke tests
- Reusable React production error boundary
- Core database/module sanity checks
- Clear PASS/FAIL/SKIP test output

## Smoke test

From project root:

```powershell
npm run start
```

In another terminal:

```powershell
node scripts/smoke-v53.mjs
```

For protected admin checks:

```powershell
$env:ADMIN_EMAIL="your-admin-email"
$env:ADMIN_PASSWORD="your-admin-password"
node scripts/smoke-v53.mjs
```

Optional server URL:

```powershell
$env:BASE_URL="http://localhost:5000"
```

## Admin reliability endpoint

`GET /api/admin/system/v53/reliability`

It checks:
- database
- students table
- teachers table
- attendance
- fees
- audit

## Important

The error boundary is reusable; it should be wrapped around the main React application/root when integrating it into the existing app entry point.

No paid service or dependency was added.
V52 is preserved in `UPGRADE_BACKUP_V52`.
