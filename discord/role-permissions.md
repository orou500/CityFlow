# CityFlow Discord Role Permissions

## Permission Reference

### Discord Permissions (Bitwise Values)
- **Administrator**: 8
- **Manage Server**: 32
- **Manage Channels**: 16
- **Manage Messages**: 8192
- **Manage Roles**: 268435456
- **Kick Members**: 2
- **Ban Members**: 4
- **Manage Nicknames**: 134217728
- **View Audit Log**: 128
- **Read Messages**: 1024
- **Send Messages**: 2048
- **Embed Links**: 16384
- **Attach Files**: 32768
- **Add Reactions**: 64
- **Use External Emojis**: 262144
- **Connect**: 1048576
- **Speak**: 2097152
- **Use Voice Activity**: 131072
- **Priority Speaker**: 256
- **Mute Members**: 4194304
- **Deafen Members**: 8388608
- **Move Members**: 16777216

## Role Hierarchy (Highest to Lowest)

### 1. Owner
**Color:** #E74C3C
**Permissions:** Administrator (8)
**Hoist:** Yes
**Mentionable:** No
**Purpose:** Server owner with full control

### 2. Administrator
**Color:** #E74C3C
**Permissions:** Administrator (8)
**Hoist:** Yes
**Mentionable:** No
**Purpose:** Server administrators with full access

### 3. Developer
**Color:** #5865F2
**Permissions:**
- Manage Server (32)
- Manage Channels (16)
- Manage Messages (8192)
- Manage Roles (268435456)
- Kick Members (2)
- Ban Members (4)
- View Audit Log (128)
- Read Messages (1024)
- Send Messages (2048)
- Embed Links (16384)
- Attach Files (32768)
- Add Reactions (64)
- Use External Emojis (262144)

**Total Permissions:** 268693010
**Hoist:** Yes
**Mentionable:** Yes
**Purpose:** CityFlow development team

### 4. Community Manager
**Color:** #5865F2
**Permissions:**
- Manage Server (32)
- Manage Channels (16)
- Manage Messages (8192)
- Kick Members (2)
- View Audit Log (128)
- Read Messages (1024)
- Send Messages (2048)
- Embed Links (16384)
- Attach Files (32768)
- Add Reactions (64)
- Use External Emojis (262144)

**Total Permissions:** 262414346
**Hoist:** Yes
**Mentionable:** Yes
**Purpose:** Manages community activities and events

### 5. Senior Moderator
**Color:** #FEE75C
**Permissions:**
- Manage Messages (8192)
- Kick Members (2)
- Ban Members (4)
- Manage Nicknames (134217728)
- Read Messages (1024)
- Send Messages (2048)
- Embed Links (16384)
- Attach Files (32768)
- Add Reactions (64)
- Use External Emojis (262144)

**Total Permissions:** 134434170
**Hoist:** Yes
**Mentionable:** Yes
**Purpose:** Senior moderators with additional permissions

### 6. Moderator
**Color:** #FEE75C
**Permissions:**
- Manage Messages (8192)
- Kick Members (2)
- Read Messages (1024)
- Send Messages (2048)
- Embed Links (16384)
- Attach Files (32768)
- Add Reactions (64)
- Use External Emojis (262144)

**Total Permissions:** 262414338
**Hoist:** Yes
**Mentionable:** Yes
**Purpose:** Server moderators

### 7. Helper
**Color:** #57F287
**Permissions:**
- Manage Messages (8192)
- Read Messages (1024)
- Send Messages (2048)
- Embed Links (16384)
- Attach Files (32768)
- Add Reactions (64)
- Use External Emojis (262144)

**Total Permissions:** 262414336
**Hoist:** Yes
**Mentionable:** Yes
**Purpose:** Community helpers who assist players

### 8. VIP
**Color:** #F47FFF
**Permissions:**
- Read Messages (1024)
- Send Messages (2048)
- Embed Links (16384)
- Attach Files (32768)
- Add Reactions (64)
- Use External Emojis (262144)

**Total Permissions:** 262414336
**Hoist:** Yes
**Mentionable:** No
**Purpose:** Premium and community supporters

### 9. Content Creator
**Color:** #ED4245
**Permissions:**
- Read Messages (1024)
- Send Messages (2048)
- Embed Links (16384)
- Attach Files (32768)
- Add Reactions (64)
- Use External Emojis (262144)

**Total Permissions:** 262414336
**Hoist:** No
**Mentionable:** Yes
**Purpose:** Streamers and content creators covering CityFlow

### 10. Beta Tester
**Color:** #EB459E
**Permissions:**
- Read Messages (1024)
- Send Messages (2048)
- Embed Links (16384)
- Attach Files (32768)
- Add Reactions (64)
- Use External Emojis (262144)

**Total Permissions:** 262414336
**Hoist:** No
**Mentionable:** No
**Purpose:** Active testers during beta phase

### 11. Early Tester
**Color:** #FEE75C
**Permissions:**
- Read Messages (1024)
- Send Messages (2048)
- Embed Links (16384)
- Attach Files (32768)
- Add Reactions (64)
- Use External Emojis (262144)

**Total Permissions:** 262414336
**Hoist:** No
**Mentionable:** No
**Purpose:** Early community members who helped test the game

### 12. Verified Player
**Color:** #5865F2
**Permissions:**
- Read Messages (1024)
- Send Messages (2048)
- Embed Links (16384)
- Attach Files (32768)
- Add Reactions (64)
- Use External Emojis (262144)

**Total Permissions:** 262414336
**Hoist:** No
**Mentionable:** No
**Purpose:** Granted after verification - access to community channels

### 13. Muted
**Color:** #99AAB5
**Permissions:** 0 (None)
**Hoist:** No
**Mentionable:** No
**Purpose:** Muted members - cannot send messages or speak

### 14. Bot
**Color:** #5865F2
**Permissions:** Administrator (8)
**Hoist:** No
**Mentionable:** No
**Purpose:** Bot role - full permissions for bot accounts

## Channel Permission Overrides

### Information Category
| Channel | Role | Allow | Deny |
|---------|------|-------|------|
| #announcements | @everyone | Read Messages (1024) | Send Messages (2048) |
| #announcements | Verified Player | Read Messages (1024) | Send Messages (2048) |
| #rules | @everyone | Read Messages (1024) | Send Messages (2048) |
| #rules | Verified Player | Read Messages (1024) | Send Messages (2048) |
| #server-guide | @everyone | Read Messages (1024) | Send Messages (2048) |
| #server-guide | Verified Player | Read Messages (1024) | Send Messages (2048) |
| #getting-started | @everyone | Read Messages (1024) | Send Messages (2048) |
| #getting-started | Verified Player | Read Messages (1024) | Send Messages (2048) |

### Community Category
| Channel | Role | Allow | Deny |
|---------|------|-------|------|
| #general-chat | @everyone | Read Messages (1024) | Send Messages (2048) |
| #general-chat | Verified Player | All Permissions (104327745) | None (0) |
| #cityflow-discussion | @everyone | Read Messages (1024) | Send Messages (2048) |
| #cityflow-discussion | Verified Player | All Permissions (104327745) | None (0) |
| #screenshots | @everyone | Read Messages (1024) | Send Messages (2048) |
| #screenshots | Verified Player | All Permissions (104327745) | None (0) |
| #achievements | @everyone | Read Messages (1024) | Send Messages (2048) |
| #achievements | Verified Player | All Permissions (104327745) | None (0) |

### Support Category
| Channel | Role | Allow | Deny |
|---------|------|-------|------|
| #help | @everyone | Read Messages (1024) | Send Messages (2048) |
| #help | Verified Player | All Permissions (104327745) | None (0) |
| #bug-reports | @everyone | Read Messages (1024) | Send Messages (2048) |
| #bug-reports | Verified Player | All Permissions (104327745) | None (0) |
| #suggestions | @everyone | Read Messages (1024) | Send Messages (2048) |
| #suggestions | Verified Player | All Permissions (104327745) | None (0) |

### Events Category
| Channel | Role | Allow | Deny |
|---------|------|-------|------|
| #events | @everyone | Read Messages (1024) | Send Messages (2048) |
| #events | Verified Player | Read Messages (1024) | Send Messages (2048) |
| #events | Community Manager | All Permissions (104327745) | None (0) |
| #competitions | @everyone | Read Messages (1024) | Send Messages (2048) |
| #competitions | Verified Player | Read Messages (1024) | Send Messages (2048) |
| #competitions | Community Manager | All Permissions (104327745) | None (0) |
| #event-chat | @everyone | Read Messages (1024) | Send Messages (2048) |
| #event-chat | Verified Player | All Permissions (104327745) | None (0) |

### Development Category
| Channel | Role | Allow | Deny |
|---------|------|-------|------|
| #development-updates | @everyone | Read Messages (1024) | Send Messages (2048) |
| #development-updates | Verified Player | Read Messages (1024) | Send Messages (2048) |
| #development-updates | Developer | All Permissions (104327745) | None (0) |
| #changelog | @everyone | Read Messages (1024) | Send Messages (2048) |
| #changelog | Verified Player | Read Messages (1024) | Send Messages (2048) |
| #changelog | Developer | All Permissions (104327745) | None (0) |
| #testing-feedback | @everyone | Read Messages (1024) | Send Messages (2048) |
| #testing-feedback | Verified Player | Read Messages (1024) | Send Messages (2048) |
| #testing-feedback | Beta Tester | All Permissions (104327745) | None (0) |

### Voice Category
| Channel | Role | Allow | Deny |
|---------|------|-------|------|
| General Voice | @everyone | None (0) | Connect (1048576) |
| General Voice | Verified Player | Connect (1048576) | None (0) |
| Community Voice | @everyone | None (0) | Connect (1048576) |
| Community Voice | Verified Player | Connect (1048576) | None (0) |
| Development Voice | @everyone | None (0) | Connect (1048576) |
| Development Voice | Developer | Connect (1048576) | None (0) |
| Development Voice | Beta Tester | Connect (1048576) | None (0) |
| Event Voice | @everyone | None (0) | Connect (1048576) |
| Event Voice | Verified Player | Connect (1048576) | None (0) |

### Staff Category
| Channel | Role | Allow | Deny |
|---------|------|-------|------|
| #staff-chat | @everyone | None (0) | Read Messages (1024) |
| #staff-chat | Helper | All Permissions (104327745) | None (0) |
| #staff-chat | Moderator | All Permissions (104327745) | None (0) |
| #staff-chat | Senior Moderator | All Permissions (104327745) | None (0) |
| #staff-chat | Community Manager | All Permissions (104327745) | None (0) |
| #staff-chat | Developer | All Permissions (104327745) | None (0) |
| #staff-chat | Administrator | All Permissions (104327745) | None (0) |
| #moderation-log | @everyone | None (0) | Read Messages (1024) |
| #moderation-log | Moderator | All Permissions (104327745) | None (0) |
| #moderation-log | Senior Moderator | All Permissions (104327745) | None (0) |
| #moderation-log | Community Manager | All Permissions (104327745) | None (0) |
| #moderation-log | Developer | All Permissions (104327745) | None (0) |
| #moderation-log | Administrator | All Permissions (104327745) | None (0) |
| #staff-applications | @everyone | None (0) | Read Messages (1024) |
| #staff-applications | Senior Moderator | All Permissions (104327745) | None (0) |
| #staff-applications | Community Manager | All Permissions (104327745) | None (0) |
| #staff-applications | Administrator | All Permissions (104327745) | None (0) |
| #community-management | @everyone | None (0) | Read Messages (1024) |
| #community-management | Community Manager | All Permissions (104327745) | None (0) |
| #community-management | Developer | All Permissions (104327745) | None (0) |
| #community-management | Administrator | All Permissions (104327745) | None (0) |

### Administration Category
| Channel | Role | Allow | Deny |
|---------|------|-------|------|
| #audit-logs | @everyone | None (0) | Read Messages (1024) |
| #audit-logs | Administrator | All Permissions (104327745) | None (0) |
| #audit-logs | Owner | All Permissions (104327745) | None (0) |
| #bot-logs | @everyone | None (0) | Read Messages (1024) |
| #bot-logs | Administrator | All Permissions (104327745) | None (0) |
| #bot-logs | Owner | All Permissions (104327745) | None (0) |
| #moderation-actions | @everyone | None (0) | Read Messages (1024) |
| #moderation-actions | Administrator | All Permissions (104327745) | None (0) |
| #moderation-actions | Owner | All Permissions (104327745) | None (0) |
| #server-management | @everyone | None (0) | Read Messages (1024) |
| #server-management | Administrator | All Permissions (104327745) | None (0) |
| #server-management | Owner | All Permissions (104327745) | None (0) |

## Quick Reference

### Role Color Codes
- **Owner/Administrator**: #E74C3C (Red)
- **Developer/Community Manager**: #5865F2 (Blurple)
- **Senior Moderator/Moderator/Early Tester**: #FEE75C (Yellow)
- **Helper**: #57F287 (Green)
- **VIP**: #F47FFF (Pink)
- **Content Creator**: #ED4245 (Red)
- **Beta Tester**: #EB459E (Pink)
- **Verified Player**: #5865F2 (Blurple)
- **Muted**: #99AAB5 (Gray)
- **Bot**: #5865F2 (Blurple)

### Permission Levels
- **Level 0**: @everyone (Very limited)
- **Level 1**: Verified Player (Basic access)
- **Level 2**: Community roles (Full access)
- **Level 3**: Helper/Moderator (Moderation)
- **Level 4**: Senior Moderator+ (Advanced moderation)
- **Level 5**: Developer+ (Server management)
- **Level 6**: Administrator+ (Full control)
- **Level 7**: Owner (Ultimate control)
