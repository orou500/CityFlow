# Carl-bot Configuration for CityFlow Discord

## Overview
Carl-bot handles: verification, logging, moderation commands, auto-roles, reaction roles, and embeds.

## Setup Steps

### 1. Invite Carl-bot
- Go to https://carl.gg
- Click "Add to Server"
- Select your CityFlow server
- Grant all requested permissions

### 2. Verification System (Reaction Role)

#### Create Verification Embed in #rules
```
/cembed channel:rules title:"Welcome to CityFlow!" color:#5865F2
description:"## Server Rules

1. Be respectful to all members. No harassment, bullying, or hate speech.
2. No spamming, flooding, or self-promotion without permission.
3. Keep discussions in the appropriate channels.
4. No NSFW, explicit, or disturbing content.
5. Follow Discord's Terms of Service and Community Guidelines.
6. No exploiting bugs or glitches. Report them in #bug-reports.
7. Do not share personal information of other members.
8. Listen to staff decisions. DM staff for disputes.
9. No alt accounts for evading bans or mutes.
10. Have fun and enjoy the CityFlow community!

---

**By reacting below, you agree to follow these rules and receive the Verified Player role.**"
```

#### Setup Reaction Role
```
/crole add emoji:✅ role:Verified Player
```

### 3. Auto-Role (for new members)
```
/autorole add role:Verified Player
```

### 4. Logging Configuration

#### Join/Leave Logging
```
/log channel:bot-logs join:enabled leave:enabled
```

#### Message Logging
```
/log channel:bot-logs message:enabled edit:enabled delete:enabled bulk:enabled
```

#### Moderation Logging
```
/log channel:bot-logs moderation:enabled
```

#### Server Logging
```
/log channel:bot-logs server:enabled role:enabled
```

### 5. Moderation Commands

#### Configure Auto-Moderation
```
/automod words add word:slur1 word:slur2 action:ban
/automod invites action:delete
/automod links action:delete
/automod spam action:mute duration:10m
```

#### Set Up Welcome Message
```
/welcome channel:general-chat message:"Welcome to CityFlow, {user}! Check out #getting-started to begin playing!"
```

### 6. Auto-Response Templates

#### Bug Report Template
```
/autoset respond trigger:"!bug" response:"## Bug Report Template

**Bug Description:**
[Describe the bug]

**Steps To Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Result:**
[What you expected to happen]

**Actual Result:**
[What actually happened]

**Screenshots:**
[If applicable]

**Device/OS:**
[Your device and OS]"
```

#### Help Template
```
/autoset respond trigger:"!help" response:"## CityFlow Help

**Getting Started:**
- Visit https://cityflow.sizops.co.il to play
- Check #getting-started for registration guide

**Need Help?**
- Ask in #help for general questions
- Report bugs in #bug-reports
- Share ideas in #suggestions

**Useful Links:**
- Website: https://cityflow.sizops.co.il
- Documentation: [Link to docs]"
```

### 7. Server Stats (Optional)
```
/stats setup channel:server-stats
```

### 8. Reaction Roles for Special Roles

#### Content Creator Role
```
/crole add emoji:🎬 role:Content Creator
```

#### VIP Role (Staff-controlled)
```
/crole add emoji:👑 role:VIP
```

### 9. Auto-Moderation Rules

#### Spam Protection
```
/automod spam action:mute duration:5m threshold:5 time:10s
```

#### Caps Protection
```
/automod caps action:warn threshold:80%
```

#### Link Protection
```
/automod links action:delete whitelist:cityflow.sizops.co.il discord.gg github.com
```

### 10. Logging Format

#### Join Log Format
```
/logs join message:"{user} joined the server"
channel:bot-logs
embed:
  title: "Member Joined"
  description: "{user} ({user.id})"
  fields:
    - name: "Account Created"
      value: "{user.created_at}"
    - name: "Member Count"
      value: "{server.member_count}"
```

#### Leave Log Format
```
/logs leave message:"{user} left the server"
channel:bot-logs
embed:
  title: "Member Left"
  description: "{user} ({user.id})"
  fields:
    - name: "Member Count"
      value: "{server.member_count}"
```

#### Moderation Action Format
```
/logs moderation channel:moderation-actions
embed:
  title: "Moderation Action"
  fields:
    - name: "User"
      value: "{target}"
    - name: "Action"
      value: "{action}"
    - name: "Moderator"
      value: "{executor}"
    - name: "Reason"
      value: "{reason}"
    - name: "Duration"
      value: "{duration}"
```

### 11. Slow Mode Configuration
```
# Set slow mode on high-traffic channels
/slowmode channel:general-chat duration:10
/slowmode channel:cityflow-discussion duration:15
/slowmode channel:help duration:5
```

### 12. Channel Permissions

#### Read-Only Channels
```
/perm channel:announcements allow:@everyone:VIEW_CHANNEL deny:@everyone:SEND_MESSAGES
/perm channel:rules allow:@everyone:VIEW_CHANNEL deny:@everyone:SEND_MESSAGES
```

#### Staff-Only Channels
```
/perm channel:staff-chat allow:Helper:VIEW_CHANNEL,SEND_MESSAGES deny:@everyone:VIEW_CHANNEL
/perm channel:moderation-log allow:Moderator:VIEW_CHANNEL,SEND_MESSAGES deny:@everyone:VIEW_CHANNEL
```

### 13. Backup Configuration
```
/backup create
/backup schedule interval:24h
```

## Important Notes

1. **Test in a test server first** before deploying to production
2. **Keep Carl-bot's role high** in the role hierarchy (above other bots, below staff)
3. **Regular backups** of the configuration
4. **Monitor bot-logs** for issues
5. **Update permissions** as the server grows
