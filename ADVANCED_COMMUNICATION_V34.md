# Advanced Communication & Notification Center V34

Cost policy:
- ₹0 mandatory software cost
- No SMS gateway
- No WhatsApp API
- No paid email provider
- Uses existing local application database

Features:
- Unified communication center
- Everyone announcements
- Class + parent announcements
- Student targeted messages
- Teacher targeted messages
- Parent targeted messages
- Parents-of-student messaging
- Priority: normal/high/urgent
- Scheduled publishing
- Message history
- Recipient counts
- Read counts
- Inbox API for teacher/student/parent
- Unread count API
- Read/unread tracking
- Communication channels
- Reusable templates
- Communication audit log
- Fee reminder template
- Attendance alert template
- Exam notice template

New tables:
- communication_channels
- communication_messages
- communication_recipients
- communication_templates
- communication_audit_log

New UI:
- client/src/CommunicationCenter.jsx
- client/src/communication.css

Intended admin route:
- `/admin/communication`

Existing V33 data is preserved.
