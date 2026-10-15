# Advanced Communication & Notification System V24

Cost policy:
- ₹0 mandatory software cost
- No paid SMS
- No WhatsApp API
- No email provider
- No push notification subscription
- All communication is stored locally in the existing database

Features:
- Admin broadcast announcements
- Audience targeting: all, students, parents, class, teachers, admins
- Class + section targeting
- Normal / high / urgent priority
- Communication threads
- Message history
- Read/unread tracking
- Notification events
- Teacher -> admin messaging
- Teacher -> class messaging
- Student/parent -> reply
- Closed conversations
- Announcement templates
- Admin communication center
- Teacher communication APIs
- Portal communication APIs
- In-app notification storage

New tables:
- communication_threads
- communication_messages
- communication_recipients
- notification_events
- announcement_templates

New UI:
- client/src/CommunicationCenter.jsx
- client/src/communication.css

Intended admin route:
- `/admin/communications`

Existing V23 data is preserved.
