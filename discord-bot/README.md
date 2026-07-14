# CityFlow Discord Bot

Official Discord bot for the CityFlow community server. Provides game integration, moderation, community management, and server automation.

## Tech Stack

- **Runtime:** Node.js 20+
- **Library:** Discord.js 14
- **Database:** MongoDB (separate `cityflow-bot` database, same cluster as game)
- **Logging:** Winston
- **Container:** Alpine Linux with tini

## Architecture

```
discord-bot/
├── src/
│   ├── index.js              # Entry point
│   ├── client.js             # Discord.js client config
│   ├── config.js             # Environment config
│   ├── deploy-commands.js    # Slash command registration
│   ├── commands/
│   │   ├── moderation/       # warn, mute, unmute, kick, ban, unban, timeout, purge, slowmode
│   │   ├── staff/            # config, help, userinfo, serverinfo, warnings, infractions, nickname, lock, unlock
│   │   │                     # verifySetup, ticketSetup, suggestionSetup, suggest, suggestionReview
│   │   └── game/             # profile, leaderboard, stats
│   ├── events/
│   │   ├── interactionCreate.js     # Slash command handler + cooldowns
│   │   ├── buttonInteractions.js    # Verify, ticket, suggestion vote handlers
│   │   ├── guildMemberAdd.js        # Welcome + auto-role + logging
│   │   ├── guildMemberRemove.js     # Leave + logging
│   │   ├── messageCreate.js         # Anti-spam + bad word + link filtering
│   │   ├── messageUpdate.js         # Edit logging
│   │   └── messageDelete.js         # Delete logging
│   ├── models/
│   │   ├── GuildConfig.js    # Per-guild persistent config
│   │   ├── Warning.js        # Moderation infractions
│   │   ├── Ticket.js         # Support tickets
│   │   └── Suggestion.js     # Suggestions with votes
│   └── utils/
│       ├── commandLoader.js   # Auto-discovers commands from folders
│       ├── eventLoader.js     # Auto-discovers events
│       ├── database.js        # MongoDB connection
│       ├── guildConfig.js     # Config CRUD + log helpers
│       ├── helpers.js         # Embed builders, duration parsing
│       └── logger.js          # Winston logging
├── Dockerfile
├── package.json
└── .env.example
```

## Database

The bot uses a **separate MongoDB database** (`cityflow-bot`) on the same cluster as the game (`cityflow`). This keeps bot data isolated:

| Collection | Purpose |
|---|---|
| `guildconfigs` | Per-server configuration (channels, roles, features) |
| `warnings` | Moderation infractions and audit trail |
| `tickets` | Support ticket sessions with transcripts |
| `suggestions` | Community suggestions with vote tallies |

The game database (`cityflow`) is never touched by the bot.

## Commands

### Moderation

| Command | Description | Permissions |
|---|---|---|
| `/warn <user> <reason>` | Warn a user | ModerateMembers |
| `/mute <user> <duration> [reason]` | Mute with auto-expiry (10m, 1h, 7d) | ModerateMembers |
| `/unmute <user>` | Remove mute | ModerateMembers |
| `/kick <user> [reason]` | Kick from server | KickMembers |
| `/ban <user> [reason] [days]` | Ban with optional message deletion | BanMembers |
| `/unban <userid>` | Unban by user ID | BanMembers |
| `/timeout <user> <duration> [reason]` | Discord native timeout | ModerateMembers |
| `/purge <amount> [user]` | Bulk delete messages | ManageMessages |
| `/slowmode <seconds> [channel]` | Set channel slowmode | ManageChannels |

Duration formats: `30s`, `10m`, `2h`, `7d`

### Staff Tools

| Command | Description | Permissions |
|---|---|---|
| `/userinfo [user]` | User details, roles, warning count | ModerateMembers |
| `/serverinfo` | Server stats (members, channels, boosts) | ModerateMembers |
| `/warnings <user>` | View all warnings for a user | ModerateMembers |
| `/infractions <user>` | Infraction breakdown by type | ModerateMembers |
| `/nickname <user> <name>` | Change nickname (use `reset` to clear) | ManageNicknames |
| `/lock [channel] [reason]` | Lock channel (disable SendMessages) | ManageChannels |
| `/unlock [channel]` | Unlock channel | ManageChannels |
| `/help` | Show all commands | None |

### Configuration

| Command | Description | Permissions |
|---|---|---|
| `/config view` | View all current settings | Administrator |
| `/config welcome` | Configure welcome messages | Administrator |
| `/config leave` | Configure leave messages | Administrator |
| `/config logging` | Set mod/audit/general log channels | Administrator |
| `/config roles` | Set admin/moderator/member roles | Administrator |
| `/config moderation` | Set mute role, toggle anti-spam/raid | Administrator |
| `/config badwords` | Add/remove filtered words | Administrator |

### Verification

| Command | Description | Permissions |
|---|---|---|
| `/verify-setup <channel> <role> [log-channel]` | Deploy verification panel | Administrator |

**Workflow:**
1. User joins → sees verification panel in configured channel
2. User clicks "Verify" button
3. Bot assigns the configured role
4. Verification logged to audit channel
5. User gains access to community channels

### Tickets

| Command | Description | Permissions |
|---|---|---|
| `/ticket-setup <channel> <staff-role> [log-channel]` | Deploy ticket panel | Administrator |

**Categories:** Support, Bug Report, Appeal, Partnership, Suggestion

**Workflow:**
1. User clicks category button in ticket panel
2. Private channel created with user + staff access
3. Staff assists in the channel
4. Staff clicks "Close Ticket" → transcript saved → channel deleted after 5s

### Suggestions

| Command | Description | Permissions |
|---|---|---|
| `/suggest <content>` | Submit a suggestion | None |
| `/suggestion-review <message-id> <status> [note]` | Review a suggestion | Administrator |

**Statuses:** Pending → Under Review → Accepted / Rejected / Implemented

**Workflow:**
1. User submits suggestion via `/suggest`
2. Post appears in suggestion channel with upvote/downvote buttons
3. Staff reviews with `/suggestion-review`
4. Suggestion embed updated with status + note

### CityFlow Game Integration

| Command | Description |
|---|---|
| `/profile <username>` | View player profile (level, XP, net worth, properties) |
| `/leaderboard [type]` | View leaderboards (wealth/properties/level) |
| `/stats` | View global game statistics |

These commands fetch data from the CityFlow backend API.

## Auto-Moderation

When enabled via `/config moderation`:

- **Anti-Spam:** 5+ messages in 5 seconds → message deleted. Continued spam → 60s auto-mute.
- **Bad Word Filter:** Messages containing configured words are deleted with a warning.
- **Link Filter:** Messages containing configured domains are deleted.

## Events Logged

| Event | Channel |
|---|---|
| Member join | General log |
| Member leave | General log |
| Message edited | General log |
| Message deleted | General log |
| Warn/Mute/Kick/Ban/Timeout | Mod log |
| Verification | Audit log |
| Ticket created/closed | Ticket log |

## Setup

### 1. Create Discord Application

1. Go to https://discord.com/developers/applications
2. Create new application → copy Application ID
3. Go to Bot → copy Bot Token
4. Enable **Message Content Intent** under Privileged Gateway Intents
5. Invite bot with permissions: `Administrator` (or specific permissions below)

**Minimum permissions for invite URL:**
```
bot&permissions=8
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
DISCORD_GUILD_ID=your-server-id   # optional, for guild-only commands during dev
MONGODB_URI=mongodb://cityflow:password@cityflow-mongodb:27017/cityflow-bot?authSource=admin
CITYFLOW_API_URL=http://cityflow-backend:5000/api
```

### 3. Deploy Commands

```bash
npm run deploy
```

This registers all slash commands with Discord. Run again after adding new commands.

### 4. Start Bot

```bash
npm start
```

### 5. Server Configuration

Once the bot is online in your server:

1. Run `/config roles` to set admin and moderator roles
2. Run `/config logging` to set log channels
3. Run `/config moderation` to enable anti-spam and set mute role
4. Run `/verify-setup` to deploy the verification panel
5. Run `/ticket-setup` to deploy the ticket panel
6. Run `/config suggestion` area with `/suggestion-setup`

## Docker

```bash
# Build
docker build -t cityflow-discord-bot .

# Run
docker run -d --name cityflow-bot --env-file .env cityflow-discord-bot
```

## Kubernetes

### Prerequisites

- `ghcr-pull` image pull secret in `cityflow` namespace
- `discord-bot-secrets` secret created
- `discord-bot-config` ConfigMap applied

### Create Secrets

```bash
kubectl create secret generic discord-bot-secrets \
  --namespace=cityflow \
  --from-literal=DISCORD_TOKEN="your-bot-token" \
  --from-literal=DISCORD_CLIENT_ID="your-client-id" \
  --from-literal=DISCORD_GUILD_ID="your-guild-id" \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Update ConfigMap

Edit `k8s/config/discord-bot-configmap.yml` and replace `MONGO_PASSWORD_HERE` with the actual MongoDB password.

### Deploy

```bash
kubectl apply -k k8s/
```

Or apply just the bot:

```bash
kubectl apply -f k8s/discord-bot/
kubectl apply -f k8s/config/discord-bot-configmap.yml
```

### Check Status

```bash
kubectl get pods -n cityflow -l app.kubernetes.io/name=discord-bot
kubectl logs -n cityflow -l app.kubernetes.io/name=discord-bot -f
```

## MongoDB Collections

### guildconfigs

```json
{
  "guildId": "123456789",
  "welcome": { "enabled": true, "channelId": "...", "message": "Welcome {user}!" },
  "leave": { "enabled": true, "channelId": "...", "message": "{user} left." },
  "verification": { "enabled": true, "channelId": "...", "roleId": "...", "messageId": "..." },
  "logging": { "enabled": true, "channels": { "mod": "...", "audit": "...", "general": "..." } },
  "tickets": { "enabled": true, "categoryId": "...", "staffRoleId": "...", "logChannelId": "..." },
  "suggestions": { "enabled": true, "channelId": "...", "reviewChannelId": "..." },
  "moderation": {
    "muteRoleId": "...",
    "antiSpam": true,
    "antiRaid": false,
    "badWords": ["word1", "word2"],
    "filteredLinks": ["spam.com"]
  },
  "roles": { "admin": "...", "moderator": "...", "member": "..." }
}
```

### warnings

```json
{
  "guildId": "123456789",
  "userId": "987654321",
  "moderatorId": "111222333",
  "reason": "Spamming in general",
  "action": "warn",
  "duration": null,
  "active": true,
  "createdAt": "2026-01-01T00:00:00Z"
}
```

### tickets

```json
{
  "guildId": "123456789",
  "channelId": "ticket-username-1234",
  "creatorId": "987654321",
  "category": "support",
  "status": "open",
  "assignedTo": null,
  "closedBy": null,
  "messages": [{ "authorId": "...", "content": "...", "timestamp": "..." }]
}
```

### suggestions

```json
{
  "guildId": "123456789",
  "authorId": "987654321",
  "messageId": "111222333",
  "content": "Add dark mode",
  "status": "pending",
  "upvotes": ["user1", "user2"],
  "downvotes": ["user3"],
  "reviewNote": null,
  "reviewedBy": null
}
```

## Permissions Required

| Discord Permission | Used By |
|---|---|
| Administrator | Config, Setup commands |
| ModerateMembers | User info, warnings, mute/unmute |
| KickMembers | Kick |
| BanMembers | Ban/unban |
| ManageMessages | Purge |
| ManageChannels | Lock/unlock, slowmode |
| ManageNicknames | Nickname |
| SendMessages | Bot responses |
| EmbedLinks | Embed messages |
| ReadMessageHistory | Message logging |
| ViewChannels | General access |

## Future Features

- OAuth account linking (CityFlow game account → Discord)
- In-game notification forwarding to Discord channels
- Real-time economic alerts
- Community marketplace notifications
- Guild/organization system integration
- Discord login rewards
- Developer announcement broadcasting
