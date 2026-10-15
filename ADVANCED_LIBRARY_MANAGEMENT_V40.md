# Advanced Library Management System V40

Cost policy:
- ₹0 mandatory software cost
- Existing local Express + SQLite/sql.js + React
- No paid library SaaS

Features:
- Book catalog
- ISBN
- Categories
- Authors
- Publishers
- Editions
- Publication year
- Shelf/rack
- Multiple physical copies
- Accession numbers
- Barcode-ready IDs
- Book condition
- Student/teacher library members
- Issue
- Return
- Due dates
- Automatic late fine calculation
- Overdue report
- Reservations
- Fine payment
- Borrowing history
- Library dashboard
- Popular books report
- Category report
- Member-type circulation report
- Audit log
- Search API

New tables:
- library_categories
- library_authors
- library_publishers
- library_books
- library_copies
- library_members
- library_loans
- library_reservations
- library_fines
- library_audit_log

New UI:
- client/src/LibraryCenter.jsx
- client/src/library.css

Intended admin route:
- `/admin/library`

Public library search:
- `GET /api/library/search`

Existing V39 data is preserved.
