# Smart Library Circulation Workstation V26

Cost policy:
- ₹0 mandatory software cost
- No paid barcode service
- No paid API
- No external circulation SaaS

Added:
- Universal library search
- Barcode / accession / ISBN / title / borrower search
- Scanner-friendly barcode workflow
- One-click issue by barcode
- One-click return by barcode
- One-click renewal by barcode
- Borrower history
- Live circulation history
- Receipt numbers for issue/return/renew
- Library activity audit log
- Fine calculation on quick return
- Circulation reports
- Advanced borrower lookup
- Copy lookup
- Status-aware circulation
- Existing V25 catalog/circulation APIs preserved

New database tables:
- library_activity_log
- library_receipts

New UI:
- client/src/LibraryCirculation.jsx
- client/src/circulation.css

Intended admin route:
- `/admin/library/circulation`

Existing V25 data is preserved.
