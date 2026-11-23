# Baby World BD — Premium Telegram Order Bot

Telegram order-management bot inspired by the supplied screenshot. It is **admin-only**: no moderators or extra staff accounts.

## Included
- Telegram keyboard menu matching the reference layout
- Add order wizard (name, phone, address, product, quantity, COD, advance, note)
- All Orders, Pending, Search
- Confirm, Edit, Cancel, Return
- Steadfast order booking (requires API key + secret)
- Daily summary, overall COD totals, Activity Log
- JSON backup sent to Telegram, CSV export
- Persistent JSON database on Render disk
- Health endpoint `/health`

## 1) Create Telegram bot
1. Open Telegram and message **@BotFather**.
2. Send `/newbot`, choose a display name and username.
3. Copy the bot token. Keep it private.
4. Start a chat with your new bot and send `/start`.

## 2) Find your Telegram numeric chat ID
Temporarily use a trusted Telegram ID helper bot (for example, @userinfobot) or a small private get-id bot. Copy the numeric **chat ID** of your own private chat. Do not use a username.
Set it as `ADMIN_CHAT_ID`.

## 3) Upload this ZIP to GitHub
1. Extract the ZIP on your phone/computer.
2. Create a GitHub repository.
3. Upload all extracted files and folders (not the ZIP itself).

## 4) Deploy on Render
1. Render → New → Web Service → connect the GitHub repository.
2. Runtime: Node. Build command: `npm install`. Start command: `npm start`.
3. Add a **Persistent Disk** mounted at `/var/data` (1 GB or more).
4. Add Environment Variables:
   - `BOT_TOKEN` = BotFather token
   - `ADMIN_CHAT_ID` = your numeric Telegram private chat ID
   - `DATA_DIR` = `/var/data`
   - `PORT` = `10000`
   - `WEBHOOK_URL` = `https://YOUR-SERVICE.onrender.com`
   - `STEADFAST_API_KEY` = your Steadfast API key (optional)
   - `STEADFAST_SECRET_KEY` = your Steadfast Secret Key (optional)
   - `STEADFAST_BASE_URL` = `https://portal.packzy.com/api/v1`
5. Deploy. Open `https://YOUR-SERVICE.onrender.com/health`; it should show `{"ok":true,...}`.
6. Open the Telegram bot and send `/start`.

**Important:** A Render persistent disk is not included in every free service plan. Use a Render plan that supports persistent disks; without persistent storage, local JSON data may be lost on redeploy/restart. Keep regular backups.

## Steadfast
Booking sends the order's invoice, recipient name, phone, address, COD, product description, quantity and note to `POST /create_order` using `Api-Key` and `Secret-Key` headers. Add your own merchant API credentials in Render. A real booking creates a courier consignment; test with a real order only when ready. If the request times out, check the Steadfast merchant panel before retrying to avoid duplicate bookings.

## Notes / current limitations
- This ZIP is source code; it has not been connected to your BotFather account or deployed to your Render account.
- Live Telegram and Steadfast credentials are not available here, so live API booking cannot be verified from this package alone.
- Order data is stored in a JSON file. The bot is intended for one admin and one running Render instance.
- The Return button marks an order as Returned in this bot; it does not automatically initiate a Steadfast return request.
- For production use, keep bot tokens and courier keys only in Render Environment Variables. Never publish them in GitHub.
