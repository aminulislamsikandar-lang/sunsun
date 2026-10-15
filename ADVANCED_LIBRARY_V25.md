# Advanced Library Management System V25

Cost policy:
- ₹0 mandatory software cost
- No paid library SaaS
- No barcode subscription
- No external API dependency
- Uses existing local Express + SQLite/sql.js + React

Features:
- Book catalog
- ISBN
- Accession number
- Authors
- Publishers
- Categories
- Editions
- Publication year
- Language
- Pages
- Shelf / rack
- Multiple physical copies
- Unique barcode
- Copy condition/status
- Issue
- Return
- Renewal
- Due date
- Automatic fine calculation
- Fine payment tracking
- Maximum active loans
- Maximum renewals
- Reservations / holds
- Reservation expiry
- Student borrowers
- Teacher borrowers
- Library dashboard
- Search and filtering
- Circulation history APIs
- Library settings
- Portal library view

New database tables:
- library_categories
- library_authors
- library_publishers
- library_books
- library_copies
- library_loans
- library_reservations
- library_fines
- library_settings

New UI:
- client/src/LibraryManagement.jsx
- client/src/library.css

Intended admin route:
- `/admin/library`

Existing V24 data is preserved.
