# Adarsha Senior Secondary School — Admin Upgrade

This package upgrades the existing working full-stack school website without changing the working JWT login flow.

## Included

- Live website CMS for hero, announcements, admissions CTA and public counters.
- Live public website data from the API for leadership, programmes, achievements, news and gallery.
- Admin edit + add + delete for website content.
- School identity editor.
- Student records module.
- Faculty & staff module.
- Admission enquiry management with status tracking.
- Administrator password change.
- Activity log on the admin dashboard.
- Existing Windows-safe sql.js WASM path fix.
- Adarsha school logo and high-resolution hero image included in `client/public/images/`.
- Responsive admin sidebar and dashboard UI.

## Run locally

### Terminal 1 — backend

```bat
cd server
npm install
npm run dev
```

Expected:

```text
Sunshine School API: http://localhost:5000
```

### Terminal 2 — frontend

```bat
cd client
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
http://localhost:5173/admin
```

Development admin:

```text
admin@sunshinepublic.edu.in
Admin@12345
```

Change the password from Admin → Settings before production.

## Important

If an older server is already using port 5000, do not start a second server on that port. Keep the existing backend terminal running and start only the client in Terminal 2.

## Database

The application uses `sql.js` and persists the database to the configured `DATABASE_PATH`. New tables are created automatically on first startup.
