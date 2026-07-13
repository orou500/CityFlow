# Dyno Bot Configuration for CityFlow Discord

## Overview
Dyno handles: auto-mod, custom commands, announcements, and role management.

## Setup Steps

### 1. Invite Dyno
- Go to https://dyno.gg
- Click "Add to Server"
- Select your CityFlow server
- Grant all requested permissions

### 2. Auto-Mod Configuration

#### Word Filter
```
Actions > Word Filter
- Add filtered words: [slurs, inappropriate words]
- Action: Delete message + Warn user
- Log to: #moderation-actions
```

#### Spam Protection
```
Actions > Spam Filter
- Enable: Yes
- Messages: 5
- Time: 10 seconds
- Action: Mute for 5 minutes
- Log to: #moderation-actions
```

#### Link Protection
```
Actions > Link Filter
- Enable: Yes
- Whitelist: cityflow.sizops.co.il, discord.gg, github.com
- Action: Delete message + Warn user
```

#### Caps Protection
```
Actions > Caps Filter
- Enable: Yes
- Percentage: 80%
- Minimum Length: 10 characters
- Action: Delete message + Warn user
```

### 3. Custom Commands

#### Help Command
```
Commands > Custom Commands
Trigger: !help
Response:
## CityFlow Help

**Getting Started:**
- Visit https://cityflow.sizops.co.il to play
- Check #getting-started for registration guide

**Need Help?**
- Ask in #help for general questions
- Report bugs in #bug-reports
- Share ideas in #suggestions

**Useful Links:**
- Website: https://cityflow.sizops.co.il
```

#### Rules Command
```
Trigger: !rules
Response:
## Server Rules

1. Be respectful to all members
2. No spamming or self-promotion
3. Keep discussions in appropriate channels
4. No NSFW content
5. Follow Discord ToS
6. Report bugs, don't exploit them
7. Don't share personal info
8. Listen to staff
9. No alt accounts for ban evasion
10. Have fun!
```

#### Status Command
```
Trigger: !status
Response:
## CityFlow Status

**Server:** Online
**Players:** {online_count}
**Last Update:** {timestamp}

For real-time stats, visit: https://cityflow.sizops.co.il
```

### 4. Announcements

#### Welcome Message
```
Announcements > Welcome Message
Channel: #general-chat
Message: "Welcome to CityFlow, {user}! Check out #getting-started to begin playing!"
Delete after: 30 seconds
```

#### Leave Message
```
Announcements > Leave Message
Channel: #bot-logs
Message: "{user} has left the server."
```

### 5. Role Management

#### Auto-Role
```
Roles > Auto-Role
Role: Verified Player
When: On join
```

#### Role Commands
```
Commands > Role Commands
!role content-creator - Grants Content Creator role
!role early-tester - Grants Early Tester role (staff only)
!role beta-tester - Grants Beta Tester role (staff only)
```

### 6. Logging Configuration

#### Message Logging
```
Logging > Message Logs
Channel: #bot-logs
Log: Edits, Deletes, Bulk Deletes
```

#### Member Logging
```
Logging > Member Logs
Channel: #bot-logs
Log: Joins, Leaves, Role Changes
```

#### Moderation Logging
```
Logging > Moderation Logs
Channel: #moderation-actions
Log: Bans, Kicks, Mutes, Warns
```

### 7. Custom Embeds

#### Server Info Embed
```
/embed channel:#server-guide title:"CityFlow Server Guide" color:#5865F2
fields:
- name:"Getting Started"
  value:"New to CityFlow? Check out #getting-started for registration and gameplay guide."
- name:"Community"
  value:"Join the conversation in #general-chat and #cityflow-discussion!"
- name:"Support"
  value:"Need help? Ask in #help or report bugs in #bug-reports."
- name:"Events"
  value:"Stay updated with events in #events!"
```

#### Bug Report Embed
```
/embed channel:#bug-reports title:"Bug Report Template" color:#ED4245
fields:
- name:"Bug Description"
  value:"[Describe the bug]"
- name:"Steps to Reproduce"
  value:"1. [Step 1]\n2. [Step 2]\n3. [Step 3]"
- name:"Expected Result"
  value:"[What you expected]"
- name:"Actual Result"
  value:"[What actually happened]"
- name:"Screenshots"
  value:"[If applicable]"
```

### 8. Moderation Commands

#### Warn Command
```
/warn @user reason:"Breaking rule [X]"
```

#### Mute Command
```
/mute @user duration:10m reason:"Spamming"
```

#### Kick Command
```
/kick @user reason:"Repeated violations"
```

#### Ban Command
```
/ban @user reason:"Severe violation" delete_days:7
```

### 9. Scheduled Messages

#### Daily Reminder
```
Schedule > Custom Message
Channel: #general-chat
Time: 12:00 UTC
Message: "Remember to check #events for today's competitions!"
```

#### Weekly Recap
```
Schedule > Custom Message
Channel: #announcements
Time: Sunday 18:00 UTC
Message: "Weekly recap: [Summary of events and achievements]"
```

### 10. Auto-Response

#### Frequently Asked Questions
```
Trigger: !faq
Response: [FAQ content]
```

#### Server Stats
```
Trigger: !stats
Response: "Online: {online_count} | Total: {member_count}"
```

## Important Notes

1. **Test commands** in a test channel first
2. **Keep Dyno's role high** in the hierarchy
3. **Regular updates** to filtered words
4. **Monitor logs** for false positives
5. **Adjust thresholds** based on community size
