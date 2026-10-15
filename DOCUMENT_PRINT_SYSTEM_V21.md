# Professional Document & Print System V21

Cost policy:
- ₹0 mandatory software cost
- No paid API
- No paid PDF service
- No cloud printing service
- Uses browser print / Save as PDF

Added document types:
- Marksheet
- Report Card
- Fee Receipt
- Certificate
- Student ID Card

Features:
- Document register
- Automatic document numbers
- Draft / issued / void states
- Student linking
- Issue date
- Valid-until date
- Preview modal
- Browser Print
- Browser Save as PDF
- Official school header
- Student information
- Signature placeholders
- Document locking after issue

New database table:
- school_documents

New UI:
- client/src/DocumentCenter.jsx
- client/src/documents.css

Intended route:
- `/admin/documents`

No paid dependency was added.
Existing V20 data is preserved.
