require("dotenv").config();
const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || "").trim();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "babyworld-orders.json");
const SHOP = process.env.SHOP_NAME || "Baby World BD";
const PORT = Number(process.env.PORT || 10000);

if (!TOKEN || !ADMIN_CHAT_ID) {
  console.error("Missing BOT_TOKEN or ADMIN_CHAT_ID. Set both environment variables.");
  process.exit(1);
}
fs.mkdirSync(DATA_DIR, { recursive: true });

const bot = new Telegraf(TOKEN);
const app = express();
app.use(express.json({ limit: "1mb" }));
app.get("/", (_req, res) => res.type("text").send(`${SHOP} Telegram Order Bot is running.`));
app.get("/health", (_req, res) => res.json({ ok: true, service: "babyworld-telegram-bot" }));

const MENU = [
  ["🛒 Add Order", "📦 All Orders", "⏳ Pending"],
  ["✅ Confirm", "🚚 Steadfast", "🔎 Search"],
  ["✏️ Edit", "❌ Cancel", "↩️ Return"],
  ["📊 Report", "💰 COD হিসাব", "💾 Backup"],
  ["📜 Activity Log", "📤 Export CSV", "⚙️ Settings"]
];
const mainKeyboard = () => Markup.keyboard(MENU).resize();
const inlineBack = () => Markup.keyboard([["🏠 Main Menu", "❌ Stop"]]).resize();

function freshDB() {
  return { orders: [], logs: [], nextId: 1001, settings: { currency: "BDT" } };
}
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return freshDB(); }
}
let db = loadDB();
function saveDB() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function log(action, details = "") {
  db.logs.unshift({ at: new Date().toISOString(), action, details: String(details).slice(0, 500) });
  db.logs = db.logs.slice(0, 5000);
  saveDB();
}
function money(n) { return `৳${Number(n || 0).toLocaleString("en-BD")}`; }
function getOrder(id) { return db.orders.find(o => String(o.id).toLowerCase() === String(id).trim().toLowerCase() || String(o.invoice || "").toLowerCase() === String(id).trim().toLowerCase()); }
function statusLabel(s) {
  return ({ pending:"⏳ Pending", confirmed:"✅ Confirmed", booked:"🚚 Booked", delivered:"📦 Delivered", cancelled:"❌ Cancelled", returned:"↩️ Returned" })[s] || s;
}
function orderText(o) {
  return `🧾 *Order ${o.id}*  ·  ${statusLabel(o.status)}\n` +
    `👤 ${esc(o.name)}\n📞 ${esc(o.phone)}\n📍 ${esc(o.address)}\n` +
    `🛍️ ${esc(o.product || "—")} × ${o.quantity || 1}\n` +
    `💵 COD: *${money(o.cod)}*  |  Paid: ${money(o.paid)}\n` +
    (o.note ? `📝 ${esc(o.note)}\n` : "") +
    (o.tracking ? `🚚 Tracking: ${esc(o.tracking)}\n` : "") +
    `🕒 ${new Date(o.createdAt).toLocaleString("en-BD", { timeZone:"Asia/Dhaka" })}`;
}
function esc(v) { return String(v ?? "").replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1"); }
function listOrders(items, title) {
  if (!items.length) return `${title}\n\nকোনো অর্ডার পাওয়া যায়নি।`;
  return `${title} (${items.length})\n\n` + items.slice(0, 25).map(o =>
    `• *${o.id}* — ${esc(o.name)} | ${money(o.cod)} | ${statusLabel(o.status)}`
  ).join("\n") + (items.length > 25 ? `\n\nআরও ${items.length - 25}টি আছে। Search ব্যবহার করুন।` : "");
}
const sessions = new Map();
function setSession(ctx, value) { sessions.set(String(ctx.chat.id), value); }
function getSession(ctx) { return sessions.get(String(ctx.chat.id)); }
function clearSession(ctx) { sessions.delete(String(ctx.chat.id)); }
async function ask(ctx, prompt) { await ctx.reply(prompt, inlineBack()); }
function adminOnly(ctx) {
  return String(ctx.chat?.id) === ADMIN_CHAT_ID && ctx.chat?.type === "private";
}
bot.use(async (ctx, next) => {
  if (!adminOnly(ctx)) {
    if (ctx.chat?.type === "private") await ctx.reply("🔒 এই বটটি ব্যক্তিগত Admin ব্যবহারের জন্য সংরক্ষিত।");
    return;
  }
  return next();
});

bot.start(async ctx => {
  clearSession(ctx);
  await ctx.replyWithPhoto(
    { source: fs.existsSync(path.join(__dirname, "..", "welcome-banner.png")) ? path.join(__dirname, "..", "welcome-banner.png") : Buffer.from([]) },
    { caption: `🎉 *Welcome to ${SHOP}* 💗\n\nআপনার অর্ডার ম্যানেজমেন্ট বট প্রস্তুত।\n\n✅ শুধু Admin Access\n✅ সব অর্ডার এক জায়গায়\n✅ Steadfast Booking Support\n\nনিচের মেনু থেকে কাজ শুরু করুন 👇`, parse_mode:"Markdown", ...mainKeyboard() }
  ).catch(async () => ctx.reply(`🎉 *Welcome to ${SHOP}* 💗\nআপনার অর্ডার ম্যানেজমেন্ট বট প্রস্তুত।`, { parse_mode:"Markdown", ...mainKeyboard() }));
});
bot.command("menu", ctx => { clearSession(ctx); return ctx.reply("👑 *মূল মেনু*\nনিচের অপশন থেকে নির্বাচন করুন 👇", { parse_mode:"Markdown", ...mainKeyboard() }); });
bot.command("cancel", ctx => { clearSession(ctx); return ctx.reply("চলমান কাজ বন্ধ করা হয়েছে।", mainKeyboard()); });

async function beginAdd(ctx) {
  setSession(ctx, { type:"add", step:"name", data:{} });
  await ask(ctx, "🛒 *নতুন অর্ডার*\n\nকাস্টমারের নাম লিখুন:");
}
async function showList(ctx, filter, title) {
  const rows = db.orders.filter(filter).sort((a,b)=>b.id-a.id);
  await ctx.reply(listOrders(rows, title), { parse_mode:"Markdown", ...mainKeyboard() });
}
async function showReport(ctx) {
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Dhaka" }).format(now);
  const today = db.orders.filter(o => (o.createdAt || "").startsWith(day));
  const sum = arr => arr.reduce((s,o)=>s+Number(o.cod||0),0);
  const statuses = ["pending","confirmed","booked","delivered","cancelled","returned"];
  const lines = statuses.map(s => `${statusLabel(s)}: ${db.orders.filter(o=>o.status===s).length}`).join("\n");
  await ctx.reply(`📊 *${SHOP} রিপোর্ট*\n\nআজকের অর্ডার: *${today.length}*\nআজকের COD: *${money(sum(today))}*\nমোট অর্ডার: *${db.orders.length}*\nমোট COD: *${money(sum(db.orders))}*\n\n${lines}`, { parse_mode:"Markdown", ...mainKeyboard() });
}
async function bookSteadfast(ctx, o) {
  const key = process.env.STEADFAST_API_KEY, secret = process.env.STEADFAST_SECRET_KEY;
  if (!key || !secret) return ctx.reply("⚠️ Steadfast API Key/Secret Render Environment-এ সেট করা নেই।", mainKeyboard());
  if (o.tracking || o.consignmentId) return ctx.reply(`এই অর্ডার আগে বুক করা হয়েছে।\nTracking: ${o.tracking || o.consignmentId}`, mainKeyboard());
  const base = (process.env.STEADFAST_BASE_URL || "https://portal.packzy.com/api/v1").replace(/\/$/,"");
  try {
    const response = await fetch(`${base}/create_order`, {
      method:"POST",
      headers:{ "Api-Key":key, "Secret-Key":secret, "Content-Type":"application/json", "Accept":"application/json" },
      body:JSON.stringify({
        invoice:String(o.invoice || `BW-${o.id}`),
        recipient_name:o.name, recipient_phone:o.phone, recipient_address:o.address,
        cod_amount:Number(o.cod), note:o.note || "", item_description:o.product || "Baby World BD order",
        total_lot:Number(o.quantity || 1), delivery_type:0
      })
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok || (data.status && Number(data.status) >= 400)) throw new Error(data.message || `HTTP ${response.status}`);
    const c = data.consignment || data.data || data;
    o.consignmentId = c.consignment_id || c.consignmentId || "";
    o.tracking = c.tracking_code || c.trackingCode || "";
    o.status = "booked";
    o.updatedAt = new Date().toISOString();
    log("STEADFAST_BOOK", `${o.id} ${o.tracking}`);
    await ctx.reply(`✅ *Steadfast বুকিং সফল!*\nOrder: ${o.id}\nConsignment: ${o.consignmentId || "—"}\nTracking: ${o.tracking || "—"}`, { parse_mode:"Markdown", ...mainKeyboard() });
  } catch (e) {
    log("STEADFAST_ERROR", `${o.id}: ${e.message}`);
    await ctx.reply(`❌ বুকিং সফল হয়নি: ${e.message}\n\nএকই অর্ডার আবার বুক করার আগে Steadfast প্যানেল যাচাই করুন।`, mainKeyboard());
  }
}
async function handleMenu(ctx, text) {
  if (text === "🛒 Add Order") return beginAdd(ctx);
  if (text === "📦 All Orders") return showList(ctx, ()=>true, "📦 *সব অর্ডার*");
  if (text === "⏳ Pending") return showList(ctx, o=>o.status==="pending", "⏳ *Pending Orders*");
  if (text === "📊 Report") return showReport(ctx);
  if (text === "💰 COD হিসাব") {
    const total = db.orders.reduce((s,o)=>s+Number(o.cod||0),0);
    const delivered = db.orders.filter(o=>o.status==="delivered").reduce((s,o)=>s+Number(o.cod||0),0);
    const returned = db.orders.filter(o=>o.status==="returned").reduce((s,o)=>s+Number(o.cod||0),0);
    return ctx.reply(`💰 *COD হিসাব*\nমোট COD: ${money(total)}\nDelivered COD: ${money(delivered)}\nReturned COD: ${money(returned)}\nPending Collection: ${money(db.orders.filter(o=>["pending","confirmed","booked"].includes(o.status)).reduce((s,o)=>s+Number(o.cod||0),0))}`, {parse_mode:"Markdown", ...mainKeyboard()});
  }
  if (text === "📜 Activity Log") return ctx.reply("📜 *সর্বশেষ কার্যক্রম*\n\n" + (db.logs.slice(0,20).map(x=>`• ${new Date(x.at).toLocaleString("en-BD",{timeZone:"Asia/Dhaka"})} — ${esc(x.action)}: ${esc(x.details)}`).join("\n") || "এখনো কোনো কার্যক্রম নেই।"), {parse_mode:"Markdown", ...mainKeyboard()});
  if (text === "💾 Backup") {
    saveDB();
    await ctx.replyWithDocument({ source:DB_FILE, filename:`babyworld-backup-${Date.now()}.json` }, { caption:"💾 অর্ডার ডেটার JSON Backup" });
    return ctx.reply("Backup তৈরি হয়েছে।", mainKeyboard());
  }
  if (text === "📤 Export CSV") {
    const csvCell = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
    const rows = [["Order ID","Name","Phone","Address","Product","Quantity","COD","Paid","Status","Tracking","Created"], ...db.orders.map(o=>[o.id,o.name,o.phone,o.address,o.product,o.quantity,o.cod,o.paid,o.status,o.tracking,o.createdAt])];
    const csv = "\uFEFF" + rows.map(r=>r.map(csvCell).join(",")).join("\n");
    return ctx.replyWithDocument({ source:Buffer.from(csv), filename:"babyworld-orders.csv" }, { caption:"📤 Orders CSV Export" });
  }
  if (text === "🔎 Search") { setSession(ctx,{type:"search"}); return ask(ctx,"🔎 Order ID, ফোন নম্বর অথবা কাস্টমারের নাম লিখুন:"); }
  if (text === "✅ Confirm" || text === "✏️ Edit" || text === "❌ Cancel" || text === "↩️ Return" || text === "🚚 Steadfast") {
    const type = ({ "✅ Confirm":"confirm", "✏️ Edit":"edit", "❌ Cancel":"cancel", "↩️ Return":"return", "🚚 Steadfast":"book" })[text];
    setSession(ctx,{type,step:"id"});
    return ask(ctx, "অর্ডার ID লিখুন:");
  }
  if (text === "⚙️ Settings") return ctx.reply(`⚙️ *Settings*\nShop: ${SHOP}\nTotal orders: ${db.orders.length}\nAdmin-only: ON\nSteadfast: ${process.env.STEADFAST_API_KEY ? "Configured" : "Not configured"}\nStorage: ${DB_FILE}`, {parse_mode:"Markdown", ...mainKeyboard()});
  if (text === "🏠 Main Menu" || text === "❌ Stop") { clearSession(ctx); return ctx.reply("মূল মেনু 👇", mainKeyboard()); }
  return false;
}

bot.on("text", async ctx => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return;
  const session = getSession(ctx);
  if (!session) { const handled = await handleMenu(ctx, text); if (handled !== false) return; return ctx.reply("নিচের মেনু থেকে একটি অপশন নির্বাচন করুন।", mainKeyboard()); }
  if (text === "❌ Stop" || text === "🏠 Main Menu") { clearSession(ctx); return ctx.reply("কাজ বন্ধ করা হয়েছে।", mainKeyboard()); }

  if (session.type === "add") {
    const d = session.data;
    const fields = {
      name:["phone","👤 কাস্টমারের ফোন নম্বর লিখুন:"],
      phone:["address","📍 সম্পূর্ণ ঠিকানা লিখুন:"],
      address:["product","🛍️ পণ্যের নাম/বিবরণ লিখুন:"],
      product:["quantity","📦 পরিমাণ লিখুন (যেমন 1):"],
      quantity:["cod","💵 COD Amount লিখুন (টাকা):"],
      cod:["paid","💳 অগ্রিম পেমেন্ট থাকলে লিখুন, না থাকলে 0:"],
      paid:["note","📝 নোট লিখুন, না থাকলে - লিখুন:"]
    };
    if (session.step === "name") d.name = text;
    else if (session.step === "phone") {
      const p = text.replace(/\D/g,"");
      if (p.length < 10 || p.length > 13) return ask(ctx,"সঠিক ফোন নম্বর দিন (১০–১৩ ডিজিট):");
      d.phone = text;
    } else if (session.step === "address") d.address = text;
    else if (session.step === "product") d.product = text;
    else if (session.step === "quantity") {
      const n = Number(text); if (!Number.isInteger(n) || n < 1 || n > 999) return ask(ctx,"পরিমাণ 1 বা তার বেশি পূর্ণসংখ্যা দিন:");
      d.quantity = n;
    } else if (session.step === "cod" || session.step === "paid") {
      const n = Number(text.replace(/[৳, ]/g,""));
      if (!Number.isFinite(n) || n < 0) return ask(ctx,"সঠিক টাকার পরিমাণ লিখুন:");
      d[session.step] = n;
    } else if (session.step === "note") d.note = text === "-" ? "" : text;
    if (session.step === "note") {
      const o = { id:db.nextId++, invoice:`BW-${db.nextId-1}`, ...d, status:"pending", tracking:"", consignmentId:"", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
      db.orders.push(o); log("ORDER_CREATED", `${o.id} ${o.name} ${o.cod}`);
      clearSession(ctx);
      return ctx.reply(`🎉 *অর্ডার তৈরি হয়েছে!*\n\n${orderText(o)}`, {parse_mode:"Markdown", ...mainKeyboard()});
    }
    const next = fields[session.step];
    session.step = next[0];
    return ask(ctx,next[1]);
  }

  if (session.type === "search") {
    clearSession(ctx);
    const q = text.toLowerCase();
    const found = db.orders.filter(o => [o.id,o.invoice,o.name,o.phone,o.address,o.tracking].some(v=>String(v||"").toLowerCase().includes(q)));
    if (!found.length) return ctx.reply("কোনো অর্ডার পাওয়া যায়নি।", mainKeyboard());
    for (const o of found.slice(0,10)) await ctx.reply(orderText(o), {parse_mode:"Markdown"});
    return ctx.reply("Search শেষ।", mainKeyboard());
  }
  if (session.step === "id") {
    const o = getOrder(text);
    if (!o) return ask(ctx,"অর্ডার পাওয়া যায়নি। সঠিক Order ID দিন:");
    session.orderId = o.id;
    if (session.type === "confirm") {
      o.status="confirmed"; o.updatedAt=new Date().toISOString(); log("ORDER_CONFIRMED",o.id); clearSession(ctx);
      return ctx.reply(`✅ Order ${o.id} কনফার্ম হয়েছে।`, mainKeyboard());
    }
    if (session.type === "cancel" || session.type === "return") {
      o.status = session.type === "cancel" ? "cancelled" : "returned";
      o.updatedAt=new Date().toISOString(); log(session.type.toUpperCase(),o.id); clearSession(ctx);
      return ctx.reply(`${session.type==="cancel"?"❌ Cancel":"↩️ Return"} সম্পন্ন হয়েছে: ${o.id}`, mainKeyboard());
    }
    if (session.type === "book") { clearSession(ctx); return bookSteadfast(ctx,o); }
    if (session.type === "edit") {
      session.step="field";
      return ask(ctx,`কোন তথ্য পরিবর্তন করবেন?\n\nname / phone / address / product / quantity / cod / paid / note`);
    }
  }
  if (session.type === "edit" && session.step === "field") {
    const allowed=["name","phone","address","product","quantity","cod","paid","note"];
    if (!allowed.includes(text.toLowerCase())) return ask(ctx,"এই field পাওয়া যায়নি। name, phone, address, product, quantity, cod, paid, note থেকে লিখুন:");
    session.field=text.toLowerCase(); session.step="value";
    return ask(ctx,`নতুন ${session.field} লিখুন:`);
  }
  if (session.type === "edit" && session.step === "value") {
    const o=getOrder(session.orderId), field=session.field;
    if (["cod","paid","quantity"].includes(field)) {
      const n=Number(text.replace(/[৳, ]/g,""));
      if (!Number.isFinite(n) || n < 0) return ask(ctx,"সঠিক সংখ্যা লিখুন:");
      o[field]=n;
    } else o[field]=text;
    o.updatedAt=new Date().toISOString(); log("ORDER_EDITED",`${o.id} ${field}`);
    clearSession(ctx);
    return ctx.reply(`✏️ Order ${o.id} আপডেট হয়েছে।\n\n${orderText(o)}`, {parse_mode:"Markdown", ...mainKeyboard()});
  }
});

bot.catch((err, ctx) => {
  console.error("Bot error:", err);
  ctx.reply("⚠️ একটি সমস্যা হয়েছে। আবার চেষ্টা করুন অথবা /menu দিন।").catch(()=>{});
});

async function start() {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (webhookUrl) {
    const url = webhookUrl.replace(/\/$/,"") + "/telegram/" + TOKEN;
    app.use(bot.webhookCallback("/telegram/" + TOKEN));
    app.listen(PORT, async () => {
      await bot.telegram.setWebhook(url);
      console.log(`Webhook server listening on ${PORT}`);
    });
  } else {
    app.listen(PORT, () => console.log(`Health server listening on ${PORT}`));
    await bot.launch();
    console.log("Telegram bot started with long polling.");
  }
}
start().catch(err => { console.error(err); process.exit(1); });
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
