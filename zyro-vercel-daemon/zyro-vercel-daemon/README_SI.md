# ZYRO Streaming Bot – Vercel Daemon Edition

මෙම package එක Vercel Daemons beta එක භාවිතා කරලා Discord bot process එක background එකේ run කිරීමට සකස් කරලා තියෙන්නේ.

## ඉතා වැදගත් සීමා

- Vercel Daemons beta එකේ Hobby plan quota: සියලු projects එකතුවට මාසයකට 5 Active CPU-hours සහ 420 GB-hours Provisioned Memory.
- Daemon එකකට අවම RAM 1 GiB. එක instance එක 24/7 දුවනවා නම් memory quota එක පැය 420කින් (දින 17.5කින්) අවසන් වෙනවා. Active CPU quota එක ඊට කලින් අවසන් විය හැකියි.
- ඒ නිසා Hobby plan එකෙන් සම්පූර්ණ මාසය 24/7 guarantee කරන්න බැහැ.
- Vercel Daemons සඳහා outbound Discord UDP voice connectivity ගැන මෙම package එක deploy කර test කරන තුරු සහතිකයක් දෙන්න බැහැ.
- Vercel Daemons beta එකේ preview deployments වල run නොවේ; production deployment එකක් අවශ්‍යයි.
- Daemon local filesystem එක persistent නොවේ. මේ package එක timer/settings සඳහා Vercel Private Blob භාවිතා කරනවා.
- Bot එකේ instance count එක 1ක් තියාගන්න. එකම Discord token එකෙන් replicas කිහිපයක් එකවර run කරන්න එපා.

## Project setup

1. මෙම ZIP එක Extract කරන්න.
2. Extract කළ folder එකේ අන්තර්ගතය GitHub repository root එකට upload කර Commit කරන්න.
3. Vercel Dashboard → Add New → Project → GitHub repository එක import කරන්න.
4. Project Root Directory එක repository root එකේම තබන්න. Subfolder එකකට වෙනස් කරන්න එපා.
5. Vercel project එකේ Storage tab එකෙන් Blob store එකක් create කරන්න. Access type `Private` තෝරන්න.
6. Blob store එකේ Projects tab → Connect to Project හරහා මේ Vercel project එකට connect කරන්න. Production environment එක තෝරන්න. Vercel `BLOB_STORE_ID` සහ `VERCEL_OIDC_TOKEN_FILE` සපයනවා. Code එක `@vercel/oidc` හරහා token file එක සෑම Blob request එකකටම කියවන නිසා token rotation එකත් support කරනවා.
7. Project Settings → Environment Variables තුළ පහත values Production සඳහා add කරන්න:
   - `BOT_TOKEN` – Discord bot token
   - `BASE_ELAPSED_HOURS` – `5000`
   - `DEFAULT_STREAM_URL` – Twitch/YouTube HTTPS URL
   - `DATA_DIR` – `./data`
   - `PRESENCE_UPDATE_INTERVAL_MS` – `60000`
   - `VOICE_RECONNECT_DELAY_MS` – `5000`
   - `VOICE_RECONNECT_MAX_DELAY_MS` – `60000`
   - `DEV_GUILD_ID` – Discord test server ID (optional)
8. Real Bot Token එක GitHub එකට හෝ ZIP එකට ඇතුළත් කරන්න එපා.
9. Production deployment එකක් කරන්න. Deployments → Production → Logs / Daemons tab එකේ `zyro-bot` logs බලන්න.

## GitHub root structure

```text
vercel.json
.gitignore
README_SI.md
worker/
  Dockerfile
  package.json
  .dockerignore
  .env.example
  src/
    index.js
    commands.js
    config.js
    storage.js
    lib/
    services/
```

## Discord Bot requirements

- Bot server එකට invite කරලා තිබිය යුතුයි.
- Bot permissions: View Channel, Connect.
- Discord Slash Commands සඳහා `applications.commands` scope අවශ්‍යයි.
- පළමු වරට `/setvoice` සහ `/setstream` භාවිතා කරන්න.

## Local tests

Worker folder එකේ:

```bash
npm install
npm test
npm run check
npm start
```

Local start එකේ Vercel Blob වෙනුවට `./data` local files භාවිතා වේ.
