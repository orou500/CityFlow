# CityFlow Discord Moderation Rules

## Moderation Philosophy

### Core Principles
1. **Fairness** - Treat all members equally
2. **Consistency** - Apply rules consistently
3. **Transparency** - Explain actions clearly
4. **Proportionality** - Match punishment to offense
5. **Education** - Help members understand rules

### Staff Guidelines
- **Remain Calm** - Don't moderate when angry
- **Document Actions** - Log all moderation actions
- **Communicate** - Explain why actions were taken
- **Escalate** - Consult senior staff when unsure
- **Review** - Regularly review moderation decisions

## Warning System

### Warning Levels
1. **Verbal Warning** - Private message or DM
2. **Written Warning** - Official warning in moderation log
3. **Mute** - Temporary message restriction
4. **Kick** - Temporary removal from server
5. **Ban** - Permanent removal from server

### Warning Thresholds
- **1-2 warnings**: Verbal/Written warning
- **3 warnings**: Mute for 1 hour
- **4 warnings**: Mute for 24 hours
- **5 warnings**: Kick from server
- **6 warnings**: Ban from server

## Offense Categories

### Level 1: Minor Offenses
**Examples:**
- Minor spam (3-5 messages in quick succession)
- Slightly off-topic messages
- Minor self-promotion (1-2 messages)
- Using caps excessively (not targeted)
- Minor channel confusion

**Actions:**
- Verbal warning
- Message deletion
- Channel guidance

### Level 2: Moderate Offenses
**Examples:**
- Repeated minor spam
- Persistent off-topic discussion
- Repeated self-promotion
- Minor harassment (annoying but not harmful)
- Mild inappropriate language
- Minor rule violations

**Actions:**
- Written warning
- Mute for 1-6 hours
- Message deletion

### Level 3: Serious Offenses
**Examples:**
- Harassment or bullying
- Hate speech or discrimination
- NSFW content posting
- Doxxing (sharing personal info)
- Major spam or flooding
- Impersonation
- Ban evasion (using alt accounts)

**Actions:**
- Mute for 24 hours
- Kick from server
- Ban consideration

### Level 4: Severe Offenses
**Examples:**
- Severe harassment or threats
- Targeted hate speech
- Sharing illegal content
- Major doxxing
- Raiding or coordinated attacks
- Severe ban evasion
- Malicious exploitation of bugs

**Actions:**
- Immediate ban
- Report to Discord Trust & Safety
- Legal action if necessary

## Moderation Commands

### Carl-bot Commands

#### Warning
```
/warn @user reason:"[reason]"
```
**Usage:** Document rule violations
**Log:** #moderation-actions

#### Mute
```
/mute @user duration:[time] reason:"[reason]"
```
**Duration options:** 1m, 5m, 10m, 1h, 6h, 12h, 24h, 3d, 7d
**Usage:** Temporary message restriction
**Log:** #moderation-actions

#### Kick
```
/kick @user reason:"[reason]"
```
**Usage:** Remove member temporarily
**Log:** #moderation-actions

#### Ban
```
/ban @user reason:"[reason]" delete_days:[days]
```
**Delete days:** 0-7 days of message history
**Usage:** Permanent removal
**Log:** #moderation-actions

#### Unban
```
/unban @user
```
**Usage:** Reverse permanent ban
**Log:** #moderation-actions

#### Timeout
```
/timeout @user duration:[time] reason:"[reason]"
```
**Usage:** Discord native timeout
**Log:** #moderation-actions

### Dyno Commands

#### Warn
```
!warn @user [reason]
```

#### Mute
```
!mute @user [duration] [reason]
```

#### Kick
```
!kick @user [reason]
```

#### Ban
```
!ban @user [reason]
```

#### Unban
```
!unban @user
```

## Moderation Templates

### Warning Template
```
**Warning Issued**

**User:** {user}
**Moderator:** {moderator}
**Channel:** {channel}
**Reason:** {reason}
**Time:** {timestamp}

**Note:** Further violations may result in mute, kick, or ban.
```

### Mute Template
```
**User Muted**

**User:** {user}
**Moderator:** {moderator}
**Duration:** {duration}
**Reason:** {reason}
**Time:** {timestamp}

**Note:** You will be automatically unmuted after the duration expires.
```

### Kick Template
```
**User Kicked**

**User:** {user}
**Moderator:** {moderator}
**Reason:** {reason}
**Time:** {timestamp}

**Note:** You may rejoin the server, but further violations will result in a ban.
```

### Ban Template
```
**User Banned**

**User:** {user}
**Moderator:** {moderator}
**Reason:** {reason}
**Duration:** Permanent
**Time:** {timestamp}

**Note:** This ban is permanent. To appeal, contact staff.
```

### Unban Template
```
**User Unbanned**

**User:** {user}
**Moderator:** {moderator}
**Reason:** {reason}
**Time:** {timestamp}

**Note:** Please follow all server rules to avoid future bans.
```

## Escalation Procedures

### When to Escalate
1. **Uncertain** - If you're unsure about the severity
2. **High-Profile** - If the user is a VIP or staff
3. **Coordinated** - If it's part of a raid
4. **Illegal** - If it involves illegal activity
5. **Personal** - If it involves personal threats

### Escalation Levels
1. **Helper** → **Moderator**
2. **Moderator** → **Senior Moderator**
3. **Senior Moderator** → **Community Manager**
4. **Community Manager** → **Administrator**
5. **Administrator** → **Owner**

### Emergency Procedures
- **Raid:** Lock channels, ban raiders, alert staff
- **Doxxing:** Delete content, ban user, report to Discord
- **Threats:** Ban immediately, report to authorities
- **Illegal Content:** Ban immediately, report to Discord Trust & Safety

## Documentation

### Moderation Log Format
```
**Moderation Action**

**Date:** {date}
**Time:** {time}
**User:** {user}
**User ID:** {user_id}
**Moderator:** {moderator}
**Moderator ID:** {moderator_id}
**Action:** {action}
**Reason:** {reason}
**Channel:** {channel}
**Notes:** {additional_notes}
```

### Required Documentation
- **Warnings:** User, moderator, reason, channel, timestamp
- **Mutes:** User, moderator, reason, duration, timestamp
- **Kicks:** User, moderator, reason, timestamp
- **Bans:** User, moderator, reason, duration, timestamp, message history deleted

### Log Storage
- **Primary:** #moderation-actions
- **Backup:** #audit-logs
- **Archive:** Staff documentation system

## Common Scenarios

### Spam
**Detection:** 5+ messages in 10 seconds
**Action:**
1. Delete messages
2. Mute for 5 minutes
3. Warn user
4. Escalate if repeated

### Harassment
**Detection:** Targeted negative behavior
**Action:**
1. Delete messages
2. Mute for 1 hour
3. Warn user
4. Escalate if continued
5. Ban if severe

### Self-Promotion
**Detection:** Links to personal content without permission
**Action:**
1. Delete message
2. Warn user
3. Mute if repeated
4. Ban if persistent

### Off-Topic
**Detection:** Messages in wrong channel
**Action:**
1. Move message (if possible)
2. Redirect user
3. Warn if persistent

### Inappropriate Content
**Detection:** NSFW, violence, hate speech
**Action:**
1. Delete immediately
2. Mute for 24 hours
3. Warn user
4. Ban if severe

## Appeals Process

### Appeal Procedure
1. **Contact Staff** - DM a moderator or administrator
2. **Explain Situation** - Provide context and reasoning
3. **Staff Review** - Staff discusses the appeal
4. **Decision** - Final decision communicated to user
5. **Documentation** - Appeal outcome logged

### Appeal Timeline
- **Warnings:** Reviewed within 24 hours
- **Mutes:** Reviewed within 12 hours
- **Kicks:** Reviewed within 24 hours
- **Bans:** Reviewed within 48 hours

### Appeal Outcomes
- **Upheld** - Original action stands
- **Modified** - Action reduced or changed
- **Overturned** - Action reversed

## Staff Training

### Required Knowledge
1. **Server Rules** - Complete understanding
2. **Moderation Commands** - Proficiency with all tools
3. **Escalation Procedures** - When and how to escalate
4. **Documentation** - Proper logging procedures
5. **Communication** - Clear, professional communication

### Training Schedule
- **Initial:** Full training before moderating
- **Weekly:** Staff meetings and reviews
- **Monthly:** Advanced training sessions
- **Quarterly:** Policy updates and refreshers

### Performance Reviews
- **Weekly:** Review moderation actions
- **Monthly:** Performance evaluation
- **Quarterly:** Role assessment
- **Annually:** Full performance review

## Special Situations

### Raids
1. **Lock** all channels immediately
2. **Ban** all raid accounts
3. **Alert** senior staff
4. **Review** and adjust permissions
5. **Communicate** with community

### Doxxing
1. **Delete** content immediately
2. **Ban** user permanently
3. **Report** to Discord Trust & Safety
4. **Alert** affected users privately
5. **Document** everything

### Threats
1. **Ban** user immediately
2. **Report** to authorities if credible
3. **Document** all evidence
4. **Alert** senior staff
5. **Review** security measures

### Alt Accounts
1. **Identify** the alt account
2. **Ban** the alt account
3. **Document** the connection
4. **Escalate** to senior staff
5. **Monitor** for new alts

## Review and Updates

### Regular Reviews
- **Weekly:** Moderation action review
- **Monthly:** Policy review
- **Quarterly:** Full system review
- **Annually:** Complete overhaul if needed

### Update Process
1. **Identify** need for update
2. **Propose** changes to staff
3. **Discuss** in staff meeting
4. **Implement** approved changes
5. **Communicate** to all staff
6. **Document** changes

### Version Control
- **Version:** 1.0.0
- **Last Updated:** July 13, 2026
- **Next Review:** October 13, 2026
- **Owner:** CityFlow Administration

## Contact Information

### Staff Contacts
- **Owner:** [Owner Username]
- **Administrator:** [Administrator Username]
- **Community Manager:** [Community Manager Username]
- **Senior Moderator:** [Senior Moderator Username]

### Emergency Contacts
- **Discord Trust & Safety:** https://dis.gd/request
- **Legal Issues:** legal@sizops.co.il
- **Security Issues:** security@sizops.co.il

---

**Remember:** Moderation is about maintaining a healthy community. Always act with professionalism and fairness.
