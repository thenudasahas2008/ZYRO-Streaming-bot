# ZYRO Streaming Presence — Setup

## අවශ්‍ය දේ

- Node.js **22.12.0 හෝ ඊට වැඩි** (Node 22.23.4 භාවිතා කළ හැකියි)
- Discord Bot Token එක
- Bot එක invite කළ Discord server එක
- Persistent storage තියෙන hosting එකක්

## 1. Bot එක Discord එකට invite කරන්න

Discord Developer Portal → OAuth2 → URL Generator වෙත ගිහින් scopes දෙක තෝරන්න:

- `bot`
- `applications.commands`

Bot permissions:

- View Channels
- Connect

Bot එකට message, microphone හෝ Speak permission අවශ්‍ය නැහැ. Bot එක voice එකට යන්නේ self-muted සහ self-deafened තත්ත්වයෙන්.

## 2. Files upload කරන්න

Project ZIP එක hosting panel එකට upload කර extract කරන්න. Console එකේ මේ commands run කරන්න:

```bash
npm install
```

`.env.example` file එක `.env` ලෙස copy කර `BOT_TOKEN` එක දාන්න.

```env
BOT_TOKEN=ඔයාගේ_BOT_TOKEN_එක
BASE_ELAPSED_HOURS=5000
DEFAULT_STREAM_URL=https://www.twitch.tv/ඔයාගේ_channel
DATA_DIR=./data
PRESENCE_UPDATE_INTERVAL_MS=60000
VOICE_RECONNECT_DELAY_MS=5000
VOICE_RECONNECT_MAX_DELAY_MS=60000
DEV_GUILD_ID=
```

`DEFAULT_STREAM_URL` එකට සැබෑ Twitch හෝ YouTube HTTPS link එකක් දාන්න. නැත්නම් bot එක online සිටියත් Streaming activity එකක් පෙන්වන්නේ නැහැ; පසුව `/setstream` භාවිතා කරන්න පුළුවන්.

## 3. Bot එක start කරන්න

```bash
npm start
```

Slash commands register වීමට ටිකක් වෙලාවක් ගත විය හැකියි. ඉක්මන් test කිරීම සඳහා `.env` එකේ `DEV_GUILD_ID` ට test server ID එක දාන්න. එවිට commands එම server එකට පමණක් register වෙනවා.

## 4. Discord commands

| Command | වැඩේ | අවසරය |
|---|---|---|
| `/setvoice channel` | Bot එක රැඳී සිටිය යුතු Voice Channel එක save කර connect කරනවා | Manage Server |
| `/setstream url` | Twitch/YouTube Streaming link එක වෙනස් කරනවා | Manage Server |
| `/timer` | ගෙවී ගිය පැය සහ මිනිත්තු පෙන්වනවා | සියලු දෙනා |
| `/status` | මේ server එකේ connection සහ timer තත්ත්වය පෙන්වනවා | සියලු දෙනා |
| `/reset hours` | Global timer එක 5,000+ පැයකින් නැවත පටන් ගන්නවා | Manage Server |

## වැදගත්

- පළමු start එකේ timer එක පැය 5,000 සිට පටන් ගන්නවා.
- `data/timer-state.json` තුළ start timestamp එක save වෙන නිසා process restart වුණත් timer එක ඉදිරියට ගණනය වෙනවා.
- Hosting panel එකේ `data` folder එක persistent volume එකකට සම්බන්ධ කරන්න. Host එක restart කළාම files මැකෙන ephemeral storage එකක් නම් timer/settings නැති වෙන්න පුළුවන්.
- Voice channel එකක් **එක් server එකකට එකක්** බැගින් `/setvoice` මගින් තෝරන්න. එක bot account එකක් එක server එකේ voice channels දෙකක එකවර ඉන්න බැහැ.
- Bot එක වෙන channel එකකට move කළොත් හෝ disconnect කළොත් නියමිත channel එකට නැවත යන්න උත්සාහ කරනවා.
- `/setstream` සහ `/reset` global. එක server එකකින් වෙනස් කළොත් bot account එකේ සියලු servers වලට බලපානවා.
- Streaming presence එක profile activity label එකක් පමණයි. මේ code එක OBS video හෝ සැබෑ screen-share broadcast එකක් ආරම්භ කරන්නේ නැහැ. පැය ගණන activity text එකේ update වෙනවා; Discord හි native elapsed-time Rich Presence timestamp එකක් නොවේ.
- Timer එක පැය 5,000 සිට ආරම්භ වෙනවා කියන්නේ එම පැය සැබෑවට stream කළා කියන තහවුරුවක් නොවේ.

## Tests

```bash
npm test
npm run check
```

## Security

`.env` හෝ bot token එක කිසිම කෙනෙකුට share කරන්න එපා. Token එක පිටවුණොත් Discord Developer Portal එකෙන් reset කරන්න. `.env` සහ `data/*.json` GitHub වෙත upload නොවන ලෙස `.gitignore` සකසා ඇත.
