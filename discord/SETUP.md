# CityFlow Discord Server Setup Guide

## Overview
This guide walks you through setting up the official CityFlow Discord server with all channels, roles, permissions, and bot integrations.

## Prerequisites

1. **Discord Account** with server creation permissions
2. **Server Boost Level 2** (recommended for full features)
3. **Bot Invites** ready (Carl-bot, Dyno, Ticket Tool)
4. **Server Icon** and **Banner** images ready

## Phase 1: Server Creation

### Step 1: Create Server
1. Click the **+** button in Discord
2. Select **Create My Own**
3. Name: **CityFlow**
4. Upload server icon: `images/logo-big.png`
5. Upload server banner (if boosted)
6. Set verification level: **Medium**

### Step 2: Configure Server Settings
1. Go to **Server Settings**
2. **Overview** tab:
   - System Messages Channel: **#announcements**
   - Suppress Join/Leave messages: **Enabled**
   - Explicit Content Filter: **All Members**
3. **Roles** tab:
   - Disable "Allow anyone to @mention this role" for all roles
   - Set role hierarchy (see Phase 2)

## Phase 2: Role Setup

### Create Roles (in order from highest to lowest)

#### Staff Roles
1. **Owner** (Color: #E74C3C)
   - Permissions: Administrator
   - Hoist: Yes
   
2. **Administrator** (Color: #E74C3C)
   - Permissions: Administrator
   - Hoist: Yes

3. **Developer** (Color: #5865F2)
   - Permissions: Manage Server, Manage Channels, Manage Messages, Kick Members, Ban Members, Manage Roles, View Audit Log, Read Messages, Send Messages, Embed Links, Attach Files, Add Reactions
   - Hoist: Yes

4. **Community Manager** (Color: #5865F2)
   - Permissions: Manage Server, Manage Channels, Manage Messages, Kick Members, Manage Roles, View Audit Log, Read Messages, Send Messages, Embed Links, Attach Files, Add Reactions
   - Hoist: Yes

5. **Senior Moderator** (Color: #FEE75C)
   - Permissions: Manage Messages, Kick Members, Ban Members, Manage Nicknames, Read Messages, Send Messages, Embed Links, Attach Files, Add Reactions
   - Hoist: Yes

6. **Moderator** (Color: #FEE75C)
   - Permissions: Manage Messages, Kick Members, Read Messages, Send Messages, Embed Links, Attach Files, Add Reactions
   - Hoist: Yes

7. **Helper** (Color: #57F287)
   - Permissions: Manage Messages, Read Messages, Send Messages, Embed Links, Attach Files, Add Reactions
   - Hoist: Yes

#### Community Roles
8. **VIP** (Color: #F47FFF)
   - Permissions: Read Messages, Send Messages, Embed Links, Attach Files, Add Reactions
   - Hoist: Yes

9. **Content Creator** (Color: #ED4245)
   - Permissions: Read Messages, Send Messages, Embed Links, Attach Files, Add Reactions
   - Hoist: No

10. **Beta Tester** (Color: #EB459E)
    - Permissions: Read Messages, Send Messages, Embed Links, Attach Files, Add Reactions
    - Hoist: No

11. **Early Tester** (Color: #FEE75C)
    - Permissions: Read Messages, Send Messages, Embed Links, Attach Files, Add Reactions
    - Hoist: No

12. **Verified Player** (Color: #5865F2)
    - Permissions: Read Messages, Send Messages, Embed Links, Attach Files, Add Reactions
    - Hoist: No

#### Special Roles
13. **Muted** (Color: #99AAB5)
    - Permissions: None (deny all in channel overrides)
    - Hoist: No

14. **Bot** (Color: #5865F2)
    - Permissions: Administrator
    - Hoist: No

15. **@everyone**
    - Permissions: View Channel, Read Message History (very limited)

## Phase 3: Channel Setup

### Category 1: INFORMATION
Create these channels in order:

1. **#announcements** (Text)
   - Topic: "Official CityFlow announcements. Only staff may post."
   - Permissions: @everyone can read, not write
   - NSFW: No

2. **#rules** (Text)
   - Topic: "Server rules. Read before participating."
   - Permissions: @everyone can read, not write
   - NSFW: No

3. **#server-guide** (Text)
   - Topic: "How to use the CityFlow Discord server."
   - Permissions: @everyone can read, not write
   - NSFW: No

4. **#getting-started** (Text)
   - Topic: "New to CityFlow? Start here!"
   - Permissions: @everyone can read, not write
   - NSFW: No

### Category 2: COMMUNITY
Create these channels:

5. **#general-chat** (Text)
   - Topic: "General community discussion. Be respectful!"
   - Permissions: Verified Player can read/write
   - Slow Mode: 10 seconds
   - NSFW: No

6. **#cityflow-discussion** (Text)
   - Topic: "Discuss CityFlow strategies, investments, developments."
   - Permissions: Verified Player can read/write
   - Slow Mode: 15 seconds
   - NSFW: No

7. **#screenshots** (Text)
   - Topic: "Share screenshots of your CityFlow empire!"
   - Permissions: Verified Player can read/write
   - NSFW: No

8. **#achievements** (Text)
   - Topic: "Celebrate milestones - portfolio, acquisitions, developments!"
   - Permissions: Verified Player can read/write
   - NSFW: No

### Category 3: SUPPORT
Create these channels:

9. **#help** (Text)
   - Topic: "Need help with CityFlow? Ask here!"
   - Permissions: Verified Player can read/write
   - Slow Mode: 5 seconds
   - NSFW: No

10. **#bug-reports** (Text)
    - Topic: "Found a bug? Report it here using the format below."
    - Permissions: Verified Player can read/write
    - Thread Auto Archive: Always
    - NSFW: No

11. **#suggestions** (Text)
    - Topic: "Share your ideas for CityFlow features and improvements."
    - Permissions: Verified Player can read/write
    - NSFW: No

### Category 4: EVENTS
Create these channels:

12. **#events** (Text)
    - Topic: "Official CityFlow events and competitions."
    - Permissions: Staff can write, others can read
    - NSFW: No

13. **#competitions** (Text)
    - Topic: "Community competitions and challenges."
    - Permissions: Staff can write, others can read
    - NSFW: No

14. **#event-chat** (Text)
    - Topic: "Chat during live events."
    - Permissions: Verified Player can read/write
    - NSFW: No

### Category 5: DEVELOPMENT
Create these channels:

15. **#development-updates** (Text)
    - Topic: "Latest development progress from the team."
    - Permissions: Developers can write, others can read
    - NSFW: No

16. **#changelog** (Text)
    - Topic: "Release notes and version history."
    - Permissions: Developers can write, others can read
    - NSFW: No

17. **#testing-feedback** (Text)
    - Topic: "Discuss testing and provide feedback."
    - Permissions: Beta Testers can write, others can read
    - NSFW: No

### Category 6: VOICE
Create these channels:

18. **🔊 General Voice** (Voice)
    - Permissions: Verified Player can connect
    - User Limit: None
    - Bitrate: 64kbps

19. **🔊 Community Voice** (Voice)
    - Permissions: Verified Player can connect
    - User Limit: None
    - Bitrate: 64kbps

20. **🔊 Development Voice** (Voice)
    - Permissions: Developers, Beta Testers can connect
    - User Limit: None
    - Bitrate: 64kbps

21. **🔊 Event Voice** (Voice)
    - Permissions: Verified Player can connect
    - User Limit: None
    - Bitrate: 64kbps

### Category 7: STAFF
Create these channels:

22. **#staff-chat** (Text)
    - Topic: "Private staff communication."
    - Permissions: Staff can read/write
    - NSFW: No

23. **#moderation-log** (Text)
    - Topic: "Moderation discussions and actions."
    - Permissions: Moderators+ can read/write
    - NSFW: No

24. **#staff-applications** (Text)
    - Topic: "Staff application reviews and discussions."
    - Permissions: Senior Moderators+ can read/write
    - NSFW: No

25. **#community-management** (Text)
    - Topic: "Community planning and strategy."
    - Permissions: Community Managers+ can read/write
    - NSFW: No

### Category 8: ADMINISTRATION
Create these channels:

26. **#audit-logs** (Text)
    - Topic: "Administrative activity logs."
    - Permissions: Administrators only
    - NSFW: No

27. **#bot-logs** (Text)
    - Topic: "Bot activity and automated logs."
    - Permissions: Administrators only
    - NSFW: No

28. **#moderation-actions** (Text)
    - Topic: "Bans, mutes, warnings, and moderation actions."
    - Permissions: Administrators only
    - NSFW: No

29. **#server-management** (Text)
    - Topic: "Server administration and configuration."
    - Permissions: Administrators only
    - NSFW: No

## Phase 4: Bot Setup

### Step 1: Install Carl-bot
1. Go to https://carl.gg
2. Click "Add to Server"
3. Select CityFlow server
4. Grant all permissions
5. Follow Carl-bot setup guide (see `carl-bot.md`)

### Step 2: Install Dyno
1. Go to https://dyno.gg
2. Click "Add to Server"
3. Select CityFlow server
4. Grant all permissions
5. Follow Dyno setup guide (see `dyno.md`)

### Step 3: Install Ticket Tool
1. Go to https://tickettool.xyz
2. Click "Add to Server"
3. Select CityFlow server
4. Configure ticket categories:
   - Staff Tickets
   - Support Tickets

### Step 4: Verify Bot Permissions
Ensure all bots have:
- Manage Messages
- Manage Roles
- Kick Members
- Ban Members
- Read Messages
- Send Messages
- Embed Links
- Attach Files
- Add Reactions
- Use External Emojis

## Phase 5: Channel Content

### Step 1: Post Rules in #rules
```
## CityFlow Server Rules

1. **Be Respectful** - Treat all members with respect. No harassment, bullying, or hate speech.
2. **No Spamming** - Avoid flooding channels, excessive messages, or self-promotion.
3. **Stay On Topic** - Keep discussions in the appropriate channels.
4. **No NSFW Content** - Keep the server family-friendly.
5. **Follow Discord ToS** - Adhere to Discord's Terms of Service and Community Guidelines.
6. **Report Bugs** - Don't exploit bugs. Report them in #bug-reports.
7. **Privacy First** - Don't share personal information of other members.
8. **Listen to Staff** - Follow staff decisions. DM them for disputes.
9. **No Alts** - Don't use alternate accounts to evade bans or mutes.
10. **Have Fun!** - Enjoy the CityFlow community!

---

**By reacting below, you agree to follow these rules.**
```

### Step 2: Post Server Guide in #server-guide
```
## CityFlow Discord Server Guide

### Channels Overview

**Information**
- #announcements - Official game news
- #rules - Server rules
- #server-guide - This guide
- #getting-started - New player guide

**Community**
- #general-chat - General discussion
- #cityflow-discussion - Game strategy
- #screenshots - Share screenshots
- #achievements - Celebrate milestones

**Support**
- #help - Get help
- #bug-reports - Report bugs
- #suggestions - Share ideas

**Events**
- #events - Official events
- #competitions - Competitions
- #event-chat - Event discussion

**Development**
- #development-updates - Dev news
- #changelog - Release notes
- #testing-feedback - Test discussions

**Voice**
- 🔊 General Voice - General voice chat
- 🔊 Community Voice - Community voice
- 🔊 Development Voice - Dev voice
- 🔊 Event Voice - Event voice

### Roles

**Community**
- @Verified Player - Basic community access
- @Early Tester - Early supporters
- @Beta Tester - Testing access
- @Content Creator - Streamers/creators
- @VIP - Premium supporters

**Staff**
- @Helper - Community helpers
- @Moderator - Server moderators
- @Senior Moderator - Senior mods
- @Community Manager - Community leads
- @Developer - Dev team
- @Administrator - Server admins
- @Owner - Server owner
```

### Step 3: Post Getting Started in #getting-started
```
## Getting Started with CityFlow

### What is CityFlow?
CityFlow is a real estate simulation game where you buy, build, and develop properties in a dynamic virtual economy.

### How to Play
1. **Register** at https://cityflow.sizops.co.il
2. **Buy Properties** - Browse the marketplace
3. **Develop** - Upgrade your properties
4. **Earn** - Collect rent and sell for profit
5. **Compete** - Climb the leaderboards

### Useful Links
- **Website:** https://cityflow.sizops.co.il
- **Help:** #help
- **Bug Reports:** #bug-reports
- **Suggestions:** #suggestions

### Tips for New Players
- Start with smaller properties
- Watch market trends
- Diversify your portfolio
- Join events for bonuses
- Ask for help in #help
```

### Step 4: Post Bug Report Template in #bug-reports
```
## Bug Report Template

Use this format when reporting bugs:

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
[If applicable, attach screenshots]

**Device/OS:**
[Your device and operating system]

**Browser:**
[Your browser and version]

---

*Thank you for helping improve CityFlow!*
```

## Phase 6: Final Configuration

### Step 1: Set Server Discovery
1. Go to **Server Settings** > **Discovery**
2. Enable if server meets requirements
3. Add server description and tags

### Step 2: Enable Community Features
1. Go to **Server Settings** > **Community**
2. Enable Community
3. Set rules channel: **#rules**
4. Set updates channel: **#announcements**

### Step 3: Configure Server Boosts
1. Go to **Server Settings** > **Booster Perks**
2. Set boost level rewards:
   - Level 1: Custom emoji, 100MB upload
   - Level 2: 50MB uploads, 128kbps audio
   - Level 3: Vanity URL, 200MB uploads

### Step 4: Test Everything
1. Test verification system
2. Test moderation commands
3. Test logging
4. Test ticket system
5. Test all bot commands

## Phase 7: Launch Preparation

### Pre-Launch Checklist
- [ ] All channels created and configured
- [ ] All roles created and configured
- [ ] All bots installed and configured
- [ ] Server rules posted
- [ ] Server guide posted
- [ ] Getting started guide posted
- [ ] Bug report template posted
- [ ] Verification system tested
- [ ] Moderation tools tested
- [ ] Logging system tested
- [ ] Voice channels tested
- [ ] Staff trained on commands
- [ ] Server discovery enabled
- [ ] Community features enabled

### Launch Day
1. **Announce** on social media
2. **Share** invite link
3. **Monitor** for issues
4. **Welcome** new members
5. **Engage** with community

## Maintenance

### Daily Tasks
- Monitor #help for questions
- Check #bug-reports for issues
- Review moderation actions
- Update announcements

### Weekly Tasks
- Review server statistics
- Update server guide if needed
- Plan community events
- Staff meetings

### Monthly Tasks
- Review roles and permissions
- Update bot configurations
- Community feedback review
- Server improvements

## Support

### Staff Commands
- Carl-bot: See `carl-bot.md`
- Dyno: See `dyno.md`
- Ticket Tool: See ticket documentation

### Getting Help
- Discord Support: #staff-chat
- Bot Issues: Check bot documentation
- Server Issues: Contact Administrator

---

**Last Updated:** July 13, 2026
**Version:** 1.0.0
