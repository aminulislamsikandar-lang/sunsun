# Sunshine Public School — FINAL FIXED v2

This version fixes the server syntax error from the previous fixed ZIP.

The backend uses `sql.js` and does not require `better-sqlite3`, Python, or Visual Studio C++ build tools.

## Run

```bash
npm install
npm run install:all
npm run dev
```

Open:

- Website: http://localhost:5173
- Admin: http://localhost:5173/admin
- API health: http://localhost:5000/api/health

Development admin:

- Email: admin@sunshinepublic.edu.in
- Password: Admin@12345

If you have an old `sunshine-school-final-fixed` folder, use this ZIP as a NEW folder instead of copying files over the old installation.


## Admin Portal V2
The admin area now includes a responsive dashboard, website content navigation, leadership/programmes/achievements/news/gallery management, enquiry search/status management, school settings, quick actions, and protected admin session handling. Existing API endpoints are reused; the server SQL.js WASM path is Windows-safe.
