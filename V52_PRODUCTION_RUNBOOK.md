# V52 Production Hardening & Recovery

## Goals
- Security headers
- Request/content-type guard
- Basic per-IP/per-route rate limiting
- Production health endpoint
- Environment validation
- Database backup/export endpoint
- Backup listing and retention cleanup
- Performance/memory diagnostics
- Existing V51 UI and APIs preserved

## Before production
1. Set `NODE_ENV=production`.
2. Set a long random `JWT_SECRET`.
3. Set `CORS_ORIGIN` to the real HTTPS school domain (never `*`).
4. Configure a persistent `BACKUP_DIR` outside temporary deployment storage when possible.
5. Keep real `.env` files out of Git.
6. Change default admin credentials.
7. Run `npm install`, then the project's build command.
8. Start backend with `npm run start`.
9. Check `/api/system/v52/health`.
10. Log in and smoke-test Admin, Teacher, Student and Parent flows.

## Backup
Admin endpoint:
`POST /api/admin/system/v52/backup`

List:
`GET /api/admin/system/v52/backups`

Cleanup:
`POST /api/admin/system/v52/backups/cleanup`

## Recovery
Keep multiple dated backups. Test restoring a backup on a separate local copy before relying on it for disaster recovery.

## Cost
No paid service or dependency was added.
