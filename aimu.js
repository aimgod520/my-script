#!/usr/bin/env node
// aimgod_ultimate.js - AIMGOD ULTIMATE V6 // SHARED NC 200ms // Author: AIMGOD
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const gTTS = require("gtts");

process.env.NTBA_FIX_319 = 1;
process.env.NTBA_FIX_350 = 1;

const STATE_FILE = "state.json";
const TOKENS_FILE = "tokens.txt";
const TARGET_FILE = "target.txt";
const ASPAM_FILE = "aspam.txt";
const HUNT_FILE = "hunt.txt";
const MAX_BOTS = 100;
const MAX_RETRIES = 10;
const RECONNECT_DELAY = 1000;

const OWNER_IDS = [5427447587, 8262785995, 5427447587];

const POLL_EMOJIS = ["💗","💘","💖","💝","💞","💓","💕","❤️","💙","💚","💛","💜"];

let chatState = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE)) : {
    admins: [...OWNER_IDS],
    delay: { 
        nc: 200, spam: 1500, vn: 3500, pfp: 3000, slide: 300, 
        photospam: 2000, desnc: 100, aspam: 1500, hunt: 2000, 
        fdspam: 2000, pollspam: 3000, panelspam: 3000, ncShared: 200 
    },
    targets: {}, muted: {}, photoreply: {}, photospam: {}, photoreload: {},
    replies: {}, autopin: {}, reactions: {}, hunt: {}, fdspam: {}, pollspam: {}, panelspam: {},
    ncLock: {}
};

function forceReloadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const newState = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
            Object.keys(newState).forEach(key => { chatState[key] = newState[key]; });
        }
    } catch (e) {}
}

function saveStateAndSync() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(chatState, null, 2));
        forceReloadState();
    } catch (e) {}
}

OWNER_IDS.forEach(oid => { if (!chatState.admins.includes(oid)) chatState.admins.push(oid); });

if (!chatState.photoreply) chatState.photoreply = {};
if (!chatState.photospam) chatState.photospam = {};
if (!chatState.photoreload) chatState.photoreload = {};
if (!chatState.replies) chatState.replies = {};
if (!chatState.autopin) chatState.autopin = {};
if (!chatState.reactions) chatState.reactions = {};
if (!chatState.hunt) chatState.hunt = {};
if (!chatState.fdspam) chatState.fdspam = {};
if (!chatState.pollspam) chatState.pollspam = {};
if (!chatState.panelspam) chatState.panelspam = {};
if (!chatState.ncLock) chatState.ncLock = {};
if (!chatState.delay.ncShared) chatState.delay.ncShared = 200;

function ensureList(chatId, key) {
    if (!chatState[key]) chatState[key] = {};
    if (!chatState[key][chatId] || !Array.isArray(chatState[key][chatId])) chatState[key][chatId] = [];
    return chatState[key][chatId];
}
function ensurePhotoReply(chatId) {
    if (!chatState.photoreply[chatId] || typeof chatState.photoreply[chatId] !== 'object') chatState.photoreply[chatId] = {};
    return chatState.photoreply[chatId];
}
function ensurePhotoSpam(chatId) {
    if (!chatState.photospam[chatId] || typeof chatState.photospam[chatId] !== 'object') chatState.photospam[chatId] = { active: false, photoFileId: null };
    return chatState.photospam[chatId];
}
function ensureReplies(chatId) {
    if (!chatState.replies[chatId] || typeof chatState.replies[chatId] !== 'object') chatState.replies[chatId] = {};
    return chatState.replies[chatId];
}
function ensureReactions(chatId) {
    if (!chatState.reactions[chatId] || typeof chatState.reactions[chatId] !== 'object') chatState.reactions[chatId] = {};
    return chatState.reactions[chatId];
}
function ensureHunt(chatId) {
    if (!chatState.hunt[chatId] || typeof chatState.hunt[chatId] !== 'object') chatState.hunt[chatId] = { active: false, targetId: null, texts: [], index: 0 };
    return chatState.hunt[chatId];
}
function ensureFdspam(chatId) {
    if (!chatState.fdspam[chatId] || typeof chatState.fdspam[chatId] !== 'object') chatState.fdspam[chatId] = { active: false, fromChatId: null, messageId: null };
    return chatState.fdspam[chatId];
}
function ensurePollSpam(chatId) {
    if (!chatState.pollspam[chatId] || typeof chatState.pollspam[chatId] !== 'object') {
        chatState.pollspam[chatId] = { active: false, question: null };
    }
    return chatState.pollspam[chatId];
}
function ensurePanelSpam(chatId) {
    if (!chatState.panelspam[chatId] || typeof chatState.panelspam[chatId] !== 'object') {
        chatState.panelspam[chatId] = { active: false, question: null };
    }
    return chatState.panelspam[chatId];
}
function getReloadPhotos(chatId) {
    if (!chatState.photoreload[chatId]) chatState.photoreload[chatId] = [];
    return chatState.photoreload[chatId];
}
function getRandomReloadPhoto(chatId) {
    const photos = getReloadPhotos(chatId);
    const validPhotos = photos.filter(p => p !== null);
    if (validPhotos.length === 0) return null;
    return validPhotos[Math.floor(Math.random() * validPhotos.length)];
}

function loadAspamTexts() {
    try {
        if (!fs.existsSync(ASPAM_FILE)) return [];
        const raw = fs.readFileSync(ASPAM_FILE, "utf8");
        const lines = raw.split(/\r?\n/);
        const result = [];
        let multiLine = null;
        for (const line of lines) {
            const trimmed = line.trim();
            if (multiLine === null) {
                if (trimmed.startsWith('"')) {
                    multiLine = trimmed.substring(1);
                    if (multiLine.endsWith('"')) { result.push(multiLine.slice(0, -1)); multiLine = null; }
                } else if (trimmed.length > 0) result.push(trimmed);
            } else {
                if (trimmed.endsWith('"')) { multiLine += '\n' + trimmed.slice(0, -1); result.push(multiLine); multiLine = null; }
                else multiLine += '\n' + trimmed;
            }
        }
        if (multiLine !== null) result.push(multiLine);
        return result;
    } catch (e) { return []; }
}

function loadHuntTexts() {
    try {
        if (!fs.existsSync(HUNT_FILE)) return [];
        const raw = fs.readFileSync(HUNT_FILE, "utf8");
        const lines = raw.split(/\r?\n/);
        const result = [];
        let multiLine = null;
        for (const line of lines) {
            const trimmed = line.trim();
            if (multiLine === null) {
                if (trimmed.startsWith('"')) {
                    multiLine = trimmed.substring(1);
                    if (multiLine.endsWith('"')) { result.push(multiLine.slice(0, -1)); multiLine = null; }
                } else if (trimmed.length > 0) result.push(trimmed);
            } else {
                if (trimmed.endsWith('"')) { multiLine += '\n' + trimmed.slice(0, -1); result.push(multiLine); multiLine = null; }
                else multiLine += '\n' + trimmed;
            }
        }
        if (multiLine !== null) result.push(multiLine);
        return result;
    } catch (e) { return []; }
}

let BOT_TOKENS = [];
try {
    if (fs.existsSync(TOKENS_FILE)) {
        BOT_TOKENS = fs.readFileSync(TOKENS_FILE, "utf8").split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, MAX_BOTS);
    }
} catch (e) {}

let TARGET_TEXTS = [];
function loadTargetTexts() {
    try {
        if (fs.existsSync(TARGET_FILE)) TARGET_TEXTS = fs.readFileSync(TARGET_FILE, "utf8").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    } catch (e) {}
}
loadTargetTexts();

const ALL_EMOJIS = ["⚡","🔥","💥","✨","🌟","⭐","🌙","☄️","🌪️","🌀","🌋","🌈","⛈️","🌊","🌩️","🖤","💜","💙","💚","💛","🧡","❤️","🎭","🎪","🎬","🎯","🎲","🎰","🎱","🏹","🗡️","🛡️","⚔️","🔫","💣","🧨","🦁","🐯","🐉","🐲","🦅","👑","💎","💀","👻","👽","🤖","🎃","🎄","🎁","🎈","🎉","🎊","🎋","🎌","🎍","🎎","🎏","🎐","🎑","🎒","🎓","🎠","🎡","🎢","🎣","🎤","🎥","🎦","🎧","🎨","🎩","🎫","🎮","🎳","🎴","🎵","🎶","🎷","🎸","🎹","🎺","🎻","🎼","🎽","🎾","🎿","🏀","🏁","🏂","🏃","🏄","🏆","🏇","🏈","🏉","🏊","🏋","🏌","🏍","🏎","🏏","🏐","🏑","🏒","🏓","🏔","🏕","🏖","🏗","🏘","🏙","🏚","😺","😸","😹","😻","😼","😽","🙀","😿","😾","😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","🤗"];

const MENU_SECTIONS = {
    status: { name: "Live Status", commands: [] },
    exec: { name: "Execution Ground", commands: [["!target", "Mark Prey"], ["!rmtarget", "Release Mark"], ["!reply <text>", "Shadow Bind"], ["!dreply", "Break Echo"]] },
    dash: { name: "Shadow Dash", commands: [["!speed <cmd> <ms>", "Adjust Speed"]] },
    rift: { name: "Spatial Rift", commands: [["!nc <t1|t2>", "Warp Name"], ["!dnc", "Stabilize Name"], ["!desnc <t1|t2>", "Warp Desc"], ["!desdnc", "Stabilize Desc"]] },
    weave: { name: "Phantasm Weave", commands: [["!pfp (reply)", "Cast Image"], ["!dpfp", "Dispel Image"]] },
    legion: { name: "Legion of Shadows", commands: [
        ["!spam <text>", "Summon Chaos"], 
        ["!dspam", "Dismiss Chaos"], 
        ["!aspam <target>", "Target Spam"], 
        ["!daspam", "Stop Target Spam"], 
        ["!fdspam (reply)", "Forward Spam"], 
        ["!dfdspam", "Stop Forward Spam"], 
        ["!pollspam <q>", "Poll Spam"], 
        ["!dpollspam", "Stop Poll Spam"], 
        ["!panelspam <t>", "Panel Spam"], 
        ["!dpanelspam", "Stop Panel Spam"]
    ]},
    hunt: { name: "Shadow Hunt", commands: [["!hunt (reply)", "Launch Hunt"], ["!dhunt", "Cease Hunt"]] },
    script: { name: "Eternal Script", commands: [["!slide <t1|t2|t3>", "Scroll Onslaught"], ["!dslide", "End Onslaught"]] },
    call: { name: "Abyssal Call", commands: [["!vn <text>", "Echo Voice"], ["!dvn", "Silence Echo"]] },
    arsenal: { name: "Shadow Arsenal", commands: [["!photoreload <1-5>", "Store Weapon"], ["!resetphoto", "Clear Arsenal"], ["!photoreply <cap>", "Auto Strike"], ["!dphotoreply", "Cease Strike"], ["!photospam", "Image Storm"], ["!dphotospam", "Calm Storm"]] },
    silence: { name: "Absolute Silencing", commands: [["!mute (reply/id)", "Banish"], ["!unmute (reply/id)", "Recall"], ["!mutelist", "List Banished"]] },
    throne: { name: "Throne of Shadows", commands: [["!sudo <id>", "Grant Power"], ["!rmsudo <id>", "Revoke Power"], ["!on", "Awaken"]] },
    pin: { name: "Auto-Pin", commands: [["!autopin", "Activate Pin Mode"], ["!dautopin", "Deactivate Pin Mode"]] },
    react: { name: "Divine Reactions", commands: [["!reactall <emoji>", "React to ALL"], ["!react <emoji>", "React to Target"], ["!stopreact", "Stop All"]] },
    stopall: { name: "Emergency Stop", commands: [["!stopall", "Stop ALL Active Modules"]] }
};

function buildMainMenuKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "Live Status", callback_data: "menu:status" }],
            [{ text: "Execution Ground", callback_data: "menu:exec" }],
            [{ text: "Shadow Dash", callback_data: "menu:dash" }],
            [{ text: "Spatial Rift", callback_data: "menu:rift" }],
            [{ text: "Phantasm Weave", callback_data: "menu:weave" }],
            [{ text: "Legion of Shadows", callback_data: "menu:legion" }],
            [{ text: "Shadow Hunt", callback_data: "menu:hunt" }],
            [{ text: "Eternal Script", callback_data: "menu:script" }],
            [{ text: "Abyssal Call", callback_data: "menu:call" }],
            [{ text: "Shadow Arsenal", callback_data: "menu:arsenal" }],
            [{ text: "Absolute Silencing", callback_data: "menu:silence" }],
            [{ text: "Throne of Shadows", callback_data: "menu:throne" }],
            [{ text: "Auto-Pin", callback_data: "menu:pin" }],
            [{ text: "Divine Reactions", callback_data: "menu:react" }],
            [{ text: "Emergency Stop", callback_data: "menu:stopall" }],
            [{ text: "Close Menu", callback_data: "menu:close" }]
        ]
    };
}

function buildSectionKeyboard(sectionId) {
    const section = MENU_SECTIONS[sectionId];
    if (!section) return buildMainMenuKeyboard();
    let buttons = [];
    if (sectionId === "status") {
        buttons.push([{ text: "Refresh Status", callback_data: "menu:status" }]);
    } else {
        buttons = section.commands.map(([cmd, desc]) => [{ text: cmd, callback_data: `cmd:${Buffer.from(cmd).toString('base64')}` }]);
    }
    buttons.push([{ text: "Back to Main Menu", callback_data: "menu:main" }]);
    buttons.push([{ text: "Close Menu", callback_data: "menu:close" }]);
    return { inline_keyboard: buttons };
}

function buildMainMenuText() {
    return `AIMGOD ULTIMATE V6 - CONTROL PANEL

Select a section below to manage the bot.

---
The One Above All - AIMGOD`;
}

function buildSectionText(sectionId, chatId) {
    if (sectionId === "status") return buildStatusText(chatId);
    const section = MENU_SECTIONS[sectionId];
    if (!section) return buildMainMenuText();
    let text = `${section.name.toUpperCase()}\n\nCommands in this section:\n\n`;
    section.commands.forEach(([cmd, desc], i) => {
        text += `${i + 1}. ${cmd}\n    - ${desc}\n\n`;
    });
    text += `---\nTap any button below to copy the command format.`;
    return text;
}

function buildResponsePanel(title, lines, buttons = []) {
    let text = `${title.toUpperCase()}\n================================\n\n`;
    text += lines.join("\n");
    text += `\n\n================================\nThe One Above All - AIMGOD`;
    const finalButtons = [...buttons, [{ text: "Back to Menu", callback_data: "menu:main" }]];
    return { text, keyboard: { inline_keyboard: finalButtons } };
}

function buildErrorPanel(title, lines) {
    let text = `ERROR: ${title.toUpperCase()}\n================================\n\n`;
    text += lines.join("\n");
    text += `\n\n================================`;
    return {
        text,
        keyboard: { inline_keyboard: [
            [{ text: "Open Help", callback_data: "menu:main" }],
            [{ text: "Close", callback_data: "menu:close" }]
        ]}
    };
}

function buildStatusText(chatId) {
    forceReloadState();
    const cs = chatState[chatId] || {};
    const delay = chatState.delay || {};
    const on = "[ON]"; const off = "[OFF]";
    const nc = cs.nc?.active ? on : off;
    const dnc = cs.desnc?.active ? on : off;
    const spam = cs.spam?.active ? on : off;
    const aspam = cs.aspam?.active ? on : off;
    const fdspam = chatState.fdspam?.[chatId]?.active ? on : off;
    const pollspam = chatState.pollspam?.[chatId]?.active ? on : off;
    const panelspam = chatState.panelspam?.[chatId]?.active ? on : off;
    const hunt = cs.hunt?.active ? on : off;
    const slide = cs.slide?.active ? on : off;
    const vn = cs.vn?.active ? on : off;
    const pfp = cs.pfp?.active ? on : off;
    const pspam = chatState.photospam?.[chatId]?.active ? on : off;
    const apin = chatState.autopin?.[chatId] ? on : off;
    const rall = chatState.reactions?.[chatId]?.reactall?.active ? on : off;
    const rtgt = chatState.reactions?.[chatId]?.react?.active ? on : off;
    const muted = (chatState.muted?.[chatId] || []).length;
    const targets = (chatState.targets?.[chatId] || []).length;
    const photos = (chatState.photoreload?.[chatId] || []).filter(p => p !== null).length;

    return `LIVE STATUS PANEL
================================

ACTIVE MODULES
--------------------------------
Name Change         ${nc}
Desc Change         ${dnc}
Spam                ${spam}
Target Spam         ${aspam}
Forward Spam        ${fdspam}
Poll Spam           ${pollspam}
Panel Spam          ${panelspam}
Hunt                ${hunt}
Slide               ${slide}
Voice Note          ${vn}
PFP Change          ${pfp}
Photo Spam          ${pspam}
Auto-Pin            ${apin}
React All           ${rall}
React Target        ${rtgt}

COUNTERS
--------------------------------
Muted Users         ${muted}
Target List         ${targets}
Photo Arsenal       ${photos}/5

SPEED SETTINGS
--------------------------------
NC Shared: ${delay.ncShared || 200}ms | Spam: ${delay.spam || 1500}ms
Aspam: ${delay.aspam || 1500}ms | Fdspam: ${delay.fdspam || 2000}ms
Pollspam: ${delay.pollspam || 3000}ms | Panelspam: ${delay.panelspam || 3000}ms
Hunt: ${delay.hunt || 2000}ms | PFP: ${delay.pfp || 3000}ms
PhotoSpam: ${delay.photospam || 2000}ms | Slide: ${delay.slide || 300}ms
VN: ${delay.vn || 3500}ms

================================
The One Above All - AIMGOD`;
}

const rateLimiters = {};
function isAdmin(userId) { return chatState.admins.includes(Number(userId)); }

async function safeSendMessage(bot, chatId, text, replyToMsg, opts = {}) {
    const options = Object.assign({ parse_mode: "Markdown" }, opts);
    try {
        if (replyToMsg && replyToMsg.message_id) options.reply_to_message_id = replyToMsg.message_id;
        return await bot.sendMessage(chatId, text, options);
    } catch (err) { return null; }
}

async function sendPanel(bot, chatId, panel, replyToMsg) {
    const options = { parse_mode: "Markdown", reply_markup: panel.keyboard };
    try {
        if (replyToMsg && replyToMsg.message_id) options.reply_to_message_id = replyToMsg.message_id;
        return await bot.sendMessage(chatId, panel.text, options);
    } catch (err) { return null; }
}

function createStableBot(token, botIndex) {
    const botOptions = {
        polling: {
            interval: 100, autoStart: true,
            params: { timeout: 30, limit: 100, allowed_updates: ["message", "callback_query", "new_chat_members", "new_chat_title", "new_chat_photo", "delete_chat_photo"] }
        },
        request: { timeout: 10000, forever: true, pool: { maxSockets: 50, maxFreeSockets: 10, timeout: 60000, freeSocketTimeout: 30000 } }
    };
    const bot = new TelegramBot(token, botOptions);
    rateLimiters[botIndex] = { lastRequest: 0 };
    bot.on("polling_error", (error) => {
        if (error.code === 'EFATAL' || error.code === 'ETELEGRAM') {
            console.log(`[BOT ${botIndex}] Critical error, restarting polling...`);
            setTimeout(() => {
                bot.stopPolling().then(() => { setTimeout(() => bot.startPolling(), 500); }).catch(() => {});
            }, RECONNECT_DELAY);
        }
    });
    bot.on("error", (error) => { console.log(`[BOT ${botIndex}] Error: ${error.message}`); });
    bot.on("webhook_error", () => {});
    setInterval(async () => { try { await bot.getMe(); } catch (e) {} }, 300000);
    return bot;
}

async function rateLimitedRequest(botIndex, fn) {
    const limiter = rateLimiters[botIndex];
    if (!limiter) return fn();
    const now = Date.now();
    const t = now - limiter.lastRequest;
    if (t < 20) await new Promise(resolve => setTimeout(resolve, 20 - t));
    limiter.lastRequest = Date.now();
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
        try { return await fn(); } catch (e) {
            if (e.response && e.response.statusCode === 429) {
                const waitTime = (e.response.body?.parameters?.retry_after || 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            if (retry >= 3) throw e;
            await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retry)));
        }
    }
}

BOT_TOKENS.forEach((token, botIndex) => {
    if (!token) return;
    let retryCount = 0;
    function initBot() {
        try {
            const bot = createStableBot(token, botIndex);
            setupBotHandlers(bot, token, botIndex);
            console.log(`[BOT ${botIndex}] Connected & Stable`);
        } catch (e) {
            if (retryCount < MAX_RETRIES) { retryCount++; setTimeout(initBot, RECONNECT_DELAY * retryCount); }
        }
    }
    initBot();
});

function setupBotHandlers(bot, token, botIndex) {
    let botUserId = null;
    bot.getMe().then(me => { botUserId = me.id; }).catch(() => {});

    bot.on("new_chat_members", async (msg) => {
        if (!botUserId) return;
        if (msg.new_chat_members.some(m => m.id === botUserId)) {
            const greeting = `AIMGOD BOT ONLINE\n========================\n\nI am here. The hunter has arrived.\nYour enemies will be dealt with.\nNo mercy. No warnings.\n\nThe hunt starts now.`;
            await bot.sendMessage(msg.chat.id, greeting, { parse_mode: "Markdown" }).catch(() => {});
        }
    });

    // ==================== SHARED NC LOOP (200ms FAST + FLOOD-SAFE) ====================
    async function runNC(chatId) {
        forceReloadState();
        const cs = chatState[chatId];
        if (!cs?.nc?.active) return;

        const sharedDelay = chatState.delay.ncShared || 200;
        if (!chatState.ncLock) chatState.ncLock = {};
        if (!chatState.ncLock[chatId]) chatState.ncLock[chatId] = { lastUpdate: 0, holder: null };

        const lock = chatState.ncLock[chatId];
        const now = Date.now();
        const timeSinceLastUpdate = now - (lock.lastUpdate || 0);

        // Not our turn yet - check again very soon
        if (timeSinceLastUpdate < sharedDelay) {
            const remaining = sharedDelay - timeSinceLastUpdate;
            const waitTime = Math.max(Math.min(remaining, 100), 30);
            setTimeout(() => runNC(chatId), waitTime);
            return;
        }

        // Race-check: reload state file to make sure nobody grabbed lock just now
        let raceSafe = true;
        try {
            const fresh = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
            if (fresh.ncLock?.[chatId]?.lastUpdate > lock.lastUpdate) {
                if (Date.now() - fresh.ncLock[chatId].lastUpdate < sharedDelay) {
                    raceSafe = false;
                }
            }
        } catch (e) {}

        if (!raceSafe) {
            setTimeout(() => runNC(chatId), 40);
            return;
        }

        // Take the lock atomically
        lock.lastUpdate = Date.now();
        lock.holder = botIndex;
        chatState.ncLock[chatId] = lock;
        saveStateAndSync();

        try {
            await rateLimitedRequest(botIndex, async () => {
                const emoji = ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)];
                const text = cs.nc.texts[Math.floor(Math.random() * cs.nc.texts.length)];
                return await bot.setChatTitle(chatId, `${emoji} ${text} ${emoji}`);
            });
            saveStateAndSync();
            // Schedule next check right at the edge of sharedDelay
            setTimeout(() => runNC(chatId), Math.max(sharedDelay - 30, 30));
        } catch (e) {
            if (e.response?.statusCode === 429) {
                // Flood detected - auto-increase shared delay
                const retryAfter = (e.response.body?.parameters?.retry_after || 5) * 1000;
                chatState.delay.ncShared = Math.min(5000, (chatState.delay.ncShared || 200) + 100);
                saveStateAndSync();
                setTimeout(() => runNC(chatId), retryAfter);
            } else {
                setTimeout(() => runNC(chatId), 100);
            }
        }
    }

    async function runDescNC(chatId) {
        forceReloadState();
        const cs = chatState[chatId];
        if (!cs?.desnc?.active) return;
        const currentDelay = cs.desnc?.currentDelay || chatState.delay.desnc || 100;
        try {
            await rateLimitedRequest(botIndex, async () => {
                const emoji = ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)];
                const text = cs.desnc.texts[Math.floor(Math.random() * cs.desnc.texts.length)];
                return await bot.setChatDescription(chatId, `${emoji} ${text} ${emoji}`);
            });
            const newDelay = Math.max(50, currentDelay - 10);
            if (!cs.desnc) cs.desnc = {};
            cs.desnc.currentDelay = newDelay;
            saveStateAndSync();
            setTimeout(() => runDescNC(chatId), newDelay);
        } catch (e) {
            if (e.response?.statusCode === 429) {
                const retryAfter = (e.response.body?.parameters?.retry_after || 3) * 1000;
                const increasedDelay = Math.min(5000, currentDelay + 200);
                if (!cs.desnc) cs.desnc = {};
                cs.desnc.currentDelay = increasedDelay;
                saveStateAndSync();
                setTimeout(() => runDescNC(chatId), retryAfter);
            } else setTimeout(() => runDescNC(chatId), 500);
        }
    }

    async function runPFP(chatId, fileId) {
        forceReloadState();
        if (!chatState[chatId]?.pfp?.active) return;
        try {
            const fileStream = await bot.getFileStream(fileId);
            await rateLimitedRequest(botIndex, () => bot.setChatPhoto(chatId, fileStream));
        } catch (e) {
            if (e.response?.statusCode === 429) { setTimeout(() => runPFP(chatId, fileId), 5000); return; }
        }
        setTimeout(() => runPFP(chatId, fileId), chatState.delay.pfp || 3000);
    }

    async function runSpam(chatId) {
        forceReloadState();
        const s = chatState[chatId]?.spam;
        if (!s?.active) return;
        try {
            const sentMsg = await rateLimitedRequest(botIndex, () => bot.sendMessage(chatId, s.text));
            if (sentMsg && sentMsg.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sentMsg.message_id).catch(() => {});
        } catch (e) {}
        setTimeout(() => runSpam(chatId), chatState.delay.spam || 1500);
    }

    async function runAspam(chatId) {
        forceReloadState();
        const as = chatState[chatId]?.aspam;
        if (!as || !as.active) return;
        const line = as.texts[as.index % as.texts.length];
        try {
            const sentMsg = await safeSendMessage(bot, chatId, line);
            if (sentMsg && sentMsg.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sentMsg.message_id).catch(() => {});
        } catch (e) {}
        as.index = (as.index + 1) % as.texts.length;
        setTimeout(() => runAspam(chatId), chatState.delay.aspam || 1500);
    }

    async function runFdspam(chatId) {
        forceReloadState();
        const fd = ensureFdspam(chatId);
        if (!fd.active || !fd.fromChatId || !fd.messageId) return;
        try {
            await rateLimitedRequest(botIndex, () => bot.forwardMessage(chatId, fd.fromChatId, fd.messageId));
        } catch (e) {}
        setTimeout(() => runFdspam(chatId), chatState.delay.fdspam || 2000);
    }

    async function runPollSpam(chatId) {
        forceReloadState();
        const ps = ensurePollSpam(chatId);
        if (!ps.active || !ps.question) return;
        try {
            const options = POLL_EMOJIS.map(e => `${ps.question} ${e}`);
            await rateLimitedRequest(botIndex, () => 
                bot.sendPoll(chatId, ps.question, options, { is_anonymous: true })
            );
        } catch (e) {}
        setTimeout(() => runPollSpam(chatId), chatState.delay.pollspam || 3000);
    }

    async function runPanelSpam(chatId) {
        forceReloadState();
        const ps = ensurePanelSpam(chatId);
        if (!ps.active || !ps.question) return;
        try {
            const rows = [];
            for (let i = 0; i < 12; i += 3) {
                const row = [];
                for (let j = 0; j < 3; j++) {
                    const idx = i + j;
                    if (idx < 12) {
                        row.push({ 
                            text: `${ps.question} ${POLL_EMOJIS[idx]}`, 
                            callback_data: `pspam:${idx}` 
                        });
                    }
                }
                if (row.length > 0) rows.push(row);
            }
            await rateLimitedRequest(botIndex, () => 
                bot.sendMessage(chatId, `📊 ${ps.question}`, {
                    reply_markup: { inline_keyboard: rows }
                })
            );
        } catch (e) {}
        setTimeout(() => runPanelSpam(chatId), chatState.delay.panelspam || 3000);
    }

    async function runHunt(chatId) {
        forceReloadState();
        const h = ensureHunt(chatId);
        if (!h.active) return;
        const line = h.texts[h.index % h.texts.length];
        const targetId = h.targetId;
        try {
            let mentionText = `[${targetId}](tg://user?id=${targetId})`;
            try {
                const chat = await bot.getChat(targetId);
                if (chat.username) mentionText = `@${chat.username}`;
                else if (chat.first_name) mentionText = `[${chat.first_name}](tg://user?id=${targetId})`;
            } catch (e) {}
            await safeSendMessage(bot, chatId, `${mentionText} ${line}`);
        } catch (e) {}
        h.index = (h.index + 1) % h.texts.length;
        saveStateAndSync();
        setTimeout(() => runHunt(chatId), chatState.delay.hunt || 2000);
    }

    async function runSlide(chatId) {
        forceReloadState();
        const cs = chatState[chatId];
        if (!cs?.slide?.active) return;
        try {
            if (cs.slide.targetId && cs.slide.texts?.length > 0) {
                for (let i = 0; i < cs.slide.texts.length; i++) {
                    setTimeout(() => { bot.sendMessage(chatId, cs.slide.texts[i], { reply_to_message_id: cs.slide.replyToMsgId }).catch(() => {}); }, i * 100);
                }
            }
        } catch (e) {}
        setTimeout(() => runSlide(chatId), chatState.delay.slide || 300);
    }

    async function runVN(chatId) {
        forceReloadState();
        const cs = chatState[chatId];
        if (!cs?.vn?.active) return;
        try {
            const vnPath = path.join(__dirname, `vn_${botIndex}_${Date.now()}.mp3`);
            await new Promise((resolve, reject) => {
                new gTTS(cs.vn.text, 'hi').save(vnPath, (err) => { if (err) reject(err); else resolve(); });
            });
            await bot.sendVoice(chatId, vnPath, { reply_to_message_id: cs.vn.replyToMsgId }).catch(() => {});
            await bot.sendMessage(chatId, cs.vn.text, { reply_to_message_id: cs.vn.replyToMsgId }).catch(() => {});
            try { fs.unlinkSync(vnPath); } catch (e) {}
        } catch (e) {}
        setTimeout(() => runVN(chatId), chatState.delay.vn || 3500);
    }

    async function runPhotoSpam(chatId) {
        forceReloadState();
        const ps = chatState.photospam[chatId];
        if (!ps?.active) return;
        try { await bot.sendPhoto(chatId, ps.photoFileId).catch(() => {}); } catch (e) {}
        setTimeout(() => runPhotoSpam(chatId), chatState.delay.photospam || 2000);
    }

    bot.on("message", async (msg) => {
        if (!msg || !msg.chat) return;
        const chatId = msg.chat.id;
        const text = msg.text || "";
        const fromId = msg.from ? Number(msg.from.id) : null;
        const messageId = msg.message_id;

        forceReloadState();
        const mutedList = ensureList(chatId, 'muted');
        if (fromId && mutedList.includes(fromId)) {
            try {
                if (mutedList._canDeleteChecked === undefined) {
                    const me = await bot.getMe();
                    const member = await bot.getChatMember(chatId, me.id);
                    mutedList._canDelete = member.status === 'administrator' && member.can_delete_messages;
                    mutedList._canDeleteChecked = true;
                }
                if (mutedList._canDelete) await bot.deleteMessage(chatId, messageId);
            } catch (e) {
                try { await bot.deleteMessage(chatId, messageId); } catch (e2) {}
            }
            return;
        }

        forceReloadState();
        const reactState = ensureReactions(chatId);
        if (reactState.reactall && reactState.reactall.active) {
            const emoji = reactState.reactall.emoji || "🔥";
            if (fromId !== (await bot.getMe()).id && !text.startsWith("!")) {
                try { await bot.setMessageReaction(chatId, messageId, { reaction: [{ type: "emoji", emoji: emoji }] }).catch(() => {}); } catch (e) {}
            }
        }
        if (reactState.react && reactState.react.active) {
            const tid = reactState.react.targetId;
            const emoji = reactState.react.emoji || "🔥";
            if (fromId === tid && !text.startsWith("!")) {
                try { await bot.setMessageReaction(chatId, messageId, { reaction: [{ type: "emoji", emoji: emoji }] }).catch(() => {}); } catch (e) {}
            }
        }

        const prChat = ensurePhotoReply(chatId);
        const randomPhoto = getRandomReloadPhoto(chatId);
        if (fromId && randomPhoto) {
            if (prChat[fromId] && prChat[fromId].active) {
                const caption = prChat[fromId].caption || "";
                bot.sendPhoto(chatId, randomPhoto.fileId, { caption: caption, reply_to_message_id: messageId }).catch(() => {});
            }
        }

        const replyObj = ensureReplies(chatId);
        if (fromId && replyObj[fromId]) {
            bot.sendMessage(chatId, replyObj[fromId], { reply_to_message_id: messageId }).catch(() => {});
            return;
        }

        const targetList = ensureList(chatId, 'targets');
        if (targetList.includes(fromId)) {
            loadTargetTexts();
            const replyId = msg.message_id;
            TARGET_TEXTS.forEach((t, i) => {
                setTimeout(() => { bot.sendMessage(chatId, t, { reply_to_message_id: replyId }).catch(() => {}); }, i * 200);
            });
        }

        if (text.startsWith("!")) {
            const args = text.trim().split(/\s+/);
            const cmd = args.shift().toLowerCase();

            if (cmd !== "!sudo" && cmd !== "!rmsudo" && !isAdmin(fromId)) {
                const errPanel = buildErrorPanel("ACCESS DENIED", [
                    `I kneel only before my liege, AIMGOD.`,
                    `You have no authority over me.`,
                    `Step aside, or be erased.`
                ]);
                await sendPanel(bot, chatId, errPanel, msg);
                return;
            }

            forceReloadState();
            if (!chatState[chatId]) chatState[chatId] = {};
            ensureList(chatId, 'muted');
            ensureList(chatId, 'targets');
            ensurePhotoReply(chatId);
            ensurePhotoSpam(chatId);
            ensureReplies(chatId);
            ensureReactions(chatId);
            ensureHunt(chatId);
            ensureFdspam(chatId);
            ensurePollSpam(chatId);
            ensurePanelSpam(chatId);
            if (!chatState.photoreload[chatId]) chatState.photoreload[chatId] = [];

            let panel = null;

            switch (cmd) {
                case "!menu": {
                    const sectionArg = args[0]?.toLowerCase();
                    if (sectionArg && MENU_SECTIONS[sectionArg]) {
                        await bot.sendMessage(chatId, buildSectionText(sectionArg, chatId), {
                            parse_mode: "Markdown", reply_markup: buildSectionKeyboard(sectionArg)
                        }).catch(() => {});
                    } else {
                        await bot.sendMessage(chatId, buildMainMenuText(), {
                            parse_mode: "Markdown", reply_markup: buildMainMenuKeyboard()
                        }).catch(() => {});
                    }
                    break;
                }

                case "!help":
                    panel = buildResponsePanel("Help", [
                        `Type !menu to open the interactive control panel.`,
                        `Or use individual commands directly.`
                    ]);
                    break;

                case "!target": {
                    let tid = msg.reply_to_message ? Number(msg.reply_to_message.from.id) : Number(args[0]);
                    if (!tid) { panel = buildErrorPanel("TARGET", ["No target specified.", "Reply to a user or provide an ID."]); break; }
                    if (!chatState.targets[chatId]) chatState.targets[chatId] = [];
                    chatState.targets[chatId].push(tid);
                    saveStateAndSync();
                    panel = buildResponsePanel("Target Acquired", [
                        `Target ID: ${tid}`, `The hunt has officially begun.`,
                        `There is no escaping what is coming.`, `Fate sealed. Their time is up.`
                    ], [[{ text: "View Targets", callback_data: "menu:exec" }]]);
                    break;
                }

                case "!rmtarget": {
                    let rid = msg.reply_to_message ? Number(msg.reply_to_message.from.id) : Number(args[0]);
                    if (!rid) { panel = buildErrorPanel("TARGET", ["No target specified."]); break; }
                    const tl = ensureList(chatId, 'targets');
                    const oldLen = tl.length;
                    chatState.targets[chatId] = tl.filter(id => id != rid);
                    if (chatState.targets[chatId].length < oldLen) {
                        saveStateAndSync();
                        panel = buildResponsePanel("Target Released", [
                            `Target ID: ${rid}`, `Chains broken. The hunt ends here.`,
                            `Freedom granted... for now.`, `But the shadows never forget.`
                        ]);
                    } else panel = buildErrorPanel("TARGET", ["User is not in the target list."]);
                    break;
                }

                case "!reply": {
                    if (!msg.reply_to_message) { panel = buildErrorPanel("REPLY", ["No message replied.", "Reply to a user's message."]); break; }
                    const rt = args.join(" ");
                    if (!rt) { panel = buildErrorPanel("REPLY", ["No text provided.", "Example: !reply Hello there"]); break; }
                    const et = Number(msg.reply_to_message.from.id);
                    ensureReplies(chatId)[et] = rt;
                    saveStateAndSync();
                    panel = buildResponsePanel("Echo Imprinted", [
                        `Target ID: ${et}`, `Your words now speak through them.`,
                        `Every message they send is yours.`
                    ]);
                    break;
                }

                case "!dreply": {
                    if (!msg.reply_to_message) { panel = buildErrorPanel("DREPLY", ["Reply to the user's message."]); break; }
                    const ret = Number(msg.reply_to_message.from.id);
                    const eo = ensureReplies(chatId);
                    if (eo[ret]) {
                        delete eo[ret]; saveStateAndSync();
                        panel = buildResponsePanel("Echo Shattered", [
                            `Target ID: ${ret}`, `The chain is broken.`,
                            `They speak for themselves now.`
                        ]);
                    } else panel = buildErrorPanel("DREPLY", ["No active echo for that user."]);
                    break;
                }

                case "!speed": {
                    if (args.length < 2) { panel = buildErrorPanel("SPEED", ["Invalid usage.", "Example: !speed spam 1000"]); break; }
                    const ty = args[0].toLowerCase(); let msv = parseInt(args[1]);
                    if (ty === 'ncshared' && msv < 100) msv = 100;
                    if (ty === 'nc' && msv < 100) msv = 100;
                    if (ty === 'desnc' && msv < 50) msv = 50;
                    if (ty === 'photospam' && msv < 500) msv = 500;
                    if (ty === 'aspam' && msv < 500) msv = 500;
                    if (ty === 'fdspam' && msv < 500) msv = 500;
                    if (ty === 'pollspam' && msv < 1000) msv = 1000;
                    if (ty === 'panelspam' && msv < 1000) msv = 1000;
                    if (ty === 'hunt' && msv < 1000) msv = 1000;
                    
                    if (ty === 'nc') {
                        chatState.delay.ncShared = msv;
                        saveStateAndSync();
                        panel = buildResponsePanel("Speed Adjusted", [
                            `NC Shared Delay: ${msv}ms`,
                            `All bots will coordinate together.`,
                            `Flood-safe mode active.`,
                            `Lower = faster but more risk.`
                        ]);
                        break;
                    }
                    
                    if (chatState.delay.hasOwnProperty(ty)) {
                        chatState.delay[ty] = msv;
                        saveStateAndSync();
                        panel = buildResponsePanel("Speed Adjusted", [
                            `Module: ${ty.toUpperCase()}`, `New Delay: ${msv}ms`,
                            `Faster than light. Faster than death.`,
                            `The shadows move on your command.`
                        ]);
                    } else panel = buildErrorPanel("SPEED", [`Unknown module: ${ty}`]);
                    break;
                }

                case "!nc": {
                    chatState[chatId].nc = { active: true, texts: args.join(" ").split("|") };
                    if (!chatState.ncLock) chatState.ncLock = {};
                    chatState.ncLock[chatId] = { lastUpdate: 0, holder: null };
                    saveStateAndSync(); runNC(chatId);
                    panel = buildResponsePanel("Name Change Active", [
                        `Reality bends to your will.`,
                        `Flood-safe mode: All bots coordinated.`,
                        `Shared delay: ${chatState.delay.ncShared || 200}ms`,
                        ``, `Status: ACTIVE`
                    ], [[{ text: "Stop NC", callback_data: "action:dnc" }]]);
                    break;
                }

                case "!dnc": {
                    forceReloadState();
                    if (chatState[chatId].nc) chatState[chatId].nc.active = false;
                    if (chatState.ncLock?.[chatId]) chatState.ncLock[chatId] = { lastUpdate: 0, holder: null };
                    saveStateAndSync();
                    panel = buildResponsePanel("Name Change Sealed", [
                        `The warp ceases. Stability restored.`,
                        `The name returns to its original form.`,
                        `The chaos rests... for now.`
                    ]);
                    break;
                }

                case "!desnc": {
                    const dt = args.join(" ").split("|").filter(t => t.trim());
                    if (dt.length === 0) { panel = buildErrorPanel("DESNC", ["No text provided.", "Example: !desnc Hello|World"]); break; }
                    chatState[chatId].desnc = { active: true, texts: dt };
                    saveStateAndSync(); runDescNC(chatId);
                    panel = buildResponsePanel("Description Active", [
                        `Group identity shifting.`,
                        `A new legend is being written.`,
                        `No going back from here.`, ``, `Status: ACTIVE`
                    ], [[{ text: "Stop DesNC", callback_data: "action:desdnc" }]]);
                    break;
                }

                case "!desdnc": {
                    forceReloadState();
                    if (chatState[chatId].desnc) chatState[chatId].desnc.active = false;
                    saveStateAndSync();
                    panel = buildResponsePanel("Description Sealed", [
                        `The warp ends. Frozen in time.`,
                        `Identity restored.`,
                        `The shadows wait for the next command.`
                    ]);
                    break;
                }

                case "!pfp": {
                    if (!msg.reply_to_message?.photo) { panel = buildErrorPanel("PFP", ["Reply to a photo."]); break; }
                    chatState[chatId].pfp = { active: true };
                    saveStateAndSync();
                    runPFP(chatId, msg.reply_to_message.photo.pop().file_id);
                    panel = buildResponsePanel("Illusion Weaving", [
                        `Picture flux engaged.`, `Reality flickers.`,
                        `The illusion becomes the truth.`
                    ], [[{ text: "Stop PFP", callback_data: "action:dpfp" }]]);
                    break;
                }

                case "!dpfp": {
                    forceReloadState();
                    if (chatState[chatId].pfp) chatState[chatId].pfp.active = false;
                    saveStateAndSync();
                    panel = buildResponsePanel("Illusion Shattered", [
                        `Truth revealed.`, `Reality restored.`,
                        `But the shadows remember everything.`
                    ]);
                    break;
                }

                case "!spam": {
                    if (args.length === 0) { panel = buildErrorPanel("SPAM", ["No text provided.", "Example: !spam hello"]); break; }
                    chatState[chatId].spam = { active: true, text: args.join(" ") };
                    saveStateAndSync(); runSpam(chatId);
                    panel = buildResponsePanel("Chaos Barrage Active", [
                        `Hellfire raining on the masses.`,
                        `No mercy. No escape.`,
                        `The storm consumes everything.`,
                        ``, `Status: ACTIVE`,
                        `Interval: ${chatState.delay.spam || 1500}ms`
                    ], [[{ text: "Stop Spam", callback_data: "action:dspam" }]]);
                    break;
                }

                case "!dspam": {
                    forceReloadState();
                    if (chatState[chatId].spam) chatState[chatId].spam.active = false;
                    saveStateAndSync();
                    panel = buildResponsePanel("Barrage Ceased", [
                        `The storm passes.`, `Silence returns.`,
                        `But the shadows are always watching.`
                    ]);
                    break;
                }

                case "!aspam": {
                    if (args.length === 0) { panel = buildErrorPanel("ASPAM", ["No target word provided.", "Example: !aspam aimgod"]); break; }
                    const tw = args.join(" ");
                    const rawLines = loadAspamTexts();
                    if (rawLines.length === 0) { panel = buildErrorPanel("ASPAM", ["aspam.txt is empty or missing."]); break; }
                    const pl = rawLines.map(line => line.replace(/\(target\)/gi, tw));
                    chatState[chatId].aspam = { active: true, texts: pl, index: 0 };
                    saveStateAndSync(); runAspam(chatId);
                    panel = buildResponsePanel("Target Spam Active", [
                        `Target Word: ${tw}`,
                        `Every line. Every word. Every curse.`,
                        `Endless cycle begins.`, ``, `Status: ACTIVE`
                    ], [[{ text: "Stop Aspam", callback_data: "action:daspam" }]]);
                    break;
                }

                case "!daspam": {
                    forceReloadState();
                    if (chatState[chatId].aspam) chatState[chatId].aspam.active = false;
                    saveStateAndSync();
                    panel = buildResponsePanel("Target Spam Sealed", [
                        `The scroll rests.`, `Peace returns.`,
                        `But the shadows remember the name.`
                    ]);
                    break;
                }

                case "!fdspam": {
                    forceReloadState();
                    if (!msg.reply_to_message) {
                        panel = buildErrorPanel("FDSPAM", [
                            `No message replied.`,
                            `Reply to any message (photo/text/video/sticker).`,
                            `Usage: Reply + !fdspam`
                        ]);
                        break;
                    }
                    const replyMsg = msg.reply_to_message;
                    const fd = ensureFdspam(chatId);
                    fd.active = true;
                    fd.fromChatId = replyMsg.chat.id;
                    fd.messageId = replyMsg.message_id;
                    saveStateAndSync(); runFdspam(chatId);

                    let type = "Text";
                    if (replyMsg.photo) type = "Photo";
                    else if (replyMsg.video) type = "Video";
                    else if (replyMsg.sticker) type = "Sticker";
                    else if (replyMsg.audio) type = "Audio";
                    else if (replyMsg.voice) type = "Voice";
                    else if (replyMsg.document) type = "Document";
                    else if (replyMsg.animation) type = "GIF";

                    panel = buildResponsePanel("Forward Spam Active", [
                        `Message Type: ${type}`,
                        `Forwarding this message repeatedly.`,
                        `Endless loop. No escape.`,
                        ``, `Status: ACTIVE`,
                        `Interval: ${chatState.delay.fdspam || 2000}ms`
                    ], [[{ text: "Stop Fdspam", callback_data: "action:dfdspam" }]]);
                    break;
                }

                case "!dfdspam": {
                    forceReloadState();
                    const fdstop = ensureFdspam(chatId);
                    if (fdstop.active) {
                        fdstop.active = false; saveStateAndSync();
                        panel = buildResponsePanel("Forward Spam Ceased", [
                            `The storm ends.`, `Silence returns.`,
                            `But the shadows never rest.`
                        ]);
                    } else panel = buildErrorPanel("FDSPAM", ["No active forward spam to stop."]);
                    break;
                }

                case "!pollspam": {
                    forceReloadState();
                    if (args.length === 0) {
                        panel = buildErrorPanel("POLLSPAM", [`No question provided.`, `Example: !pollspam hi`]);
                        break;
                    }
                    const question = args.join(" ");
                    const ps = ensurePollSpam(chatId);
                    ps.active = true;
                    ps.question = question;
                    saveStateAndSync();
                    runPollSpam(chatId);
                    panel = buildResponsePanel("Poll Spam Active", [
                        `Question: ${question}`,
                        `Options: ${question} + 12 emojis`,
                        `Creating polls repeatedly.`,
                        ``, `Status: ACTIVE`,
                        `Interval: ${chatState.delay.pollspam || 3000}ms`
                    ], [[{ text: "Stop Poll Spam", callback_data: "action:dpollspam" }]]);
                    break;
                }

                case "!dpollspam": {
                    forceReloadState();
                    const psstop = ensurePollSpam(chatId);
                    if (psstop.active) {
                        psstop.active = false;
                        saveStateAndSync();
                        panel = buildResponsePanel("Poll Spam Ceased", [
                            `The polls stop.`, `Silence returns.`,
                            `But the shadows never rest.`
                        ]);
                    } else panel = buildErrorPanel("POLLSPAM", ["No active poll spam to stop."]);
                    break;
                }

                case "!panelspam": {
                    forceReloadState();
                    if (args.length === 0) {
                        panel = buildErrorPanel("PANELSPAM", [
                            `No text provided.`,
                            `Example: !panelspam Hi`
                        ]);
                        break;
                    }
                    const pquestion = args.join(" ");
                    const ps = ensurePanelSpam(chatId);
                    ps.active = true;
                    ps.question = pquestion;
                    saveStateAndSync();
                    runPanelSpam(chatId);
                    panel = buildResponsePanel("Panel Spam Active", [
                        `Text: ${pquestion}`,
                        `Buttons: 12 (3x4 layout)`,
                        `Each button has different emoji.`,
                        ``, `Status: ACTIVE`,
                        `Interval: ${chatState.delay.panelspam || 3000}ms`
                    ], [[{ text: "Stop Panel Spam", callback_data: "action:dpanelspam" }]]);
                    break;
                }

                case "!dpanelspam": {
                    forceReloadState();
                    const psstop = ensurePanelSpam(chatId);
                    if (psstop.active) {
                        psstop.active = false;
                        saveStateAndSync();
                        panel = buildResponsePanel("Panel Spam Ceased", [
                            `The panels stop.`,
                            `Silence returns.`,
                            `But the shadows never rest.`
                        ]);
                    } else panel = buildErrorPanel("PANELSPAM", ["No active panel spam to stop."]);
                    break;
                }

                case "!hunt": {
                    forceReloadState();
                    let huntTid = null;
                    if (msg.reply_to_message) huntTid = Number(msg.reply_to_message.from.id);
                    else { panel = buildErrorPanel("HUNT", ["Reply to a user's message."]); break; }
                    if (!huntTid) { panel = buildErrorPanel("HUNT", ["No valid target."]); break; }
                    const rawHuntLines = loadHuntTexts();
                    if (rawHuntLines.length === 0) { panel = buildErrorPanel("HUNT", ["hunt.txt is empty or missing."]); break; }
                    let huntMention = `[${huntTid}](tg://user?id=${huntTid})`;
                    try {
                        const chat = await bot.getChat(huntTid);
                        if (chat.username) huntMention = `@${chat.username}`;
                        else if (chat.first_name) huntMention = `[${chat.first_name}](tg://user?id=${huntTid})`;
                    } catch (e) {}
                    const hs = ensureHunt(chatId);
                    hs.active = true; hs.targetId = huntTid; hs.texts = rawHuntLines; hs.index = 0;
                    saveStateAndSync(); runHunt(chatId);
                    panel = buildResponsePanel("Shadow Hunt Launched", [
                        `Target: ${huntMention}`,
                        `Hunt Scrolls: ${rawHuntLines.length}`,
                        `The hunt begins. No mercy.`,
                        ``, `Status: ACTIVE`
                    ], [[{ text: "Stop Hunt", callback_data: "action:dhunt" }]]);
                    break;
                }

                case "!dhunt": {
                    forceReloadState();
                    const hstop = ensureHunt(chatId);
                    if (hstop.active) {
                        hstop.active = false; saveStateAndSync();
                        panel = buildResponsePanel("Shadow Hunt Ceased", [
                            `The hunt ends.`,
                            `But the shadows always remember.`,
                            `They will strike again.`
                        ]);
                    } else panel = buildErrorPanel("HUNT", ["No active hunt to stop."]);
                    break;
                }

                case "!slide": {
                    if (!msg.reply_to_message) { panel = buildErrorPanel("SLIDE", ["Reply to a user's message."]); break; }
                    const st = args.join(" ").split("|").filter(t => t.trim());
                    if (st.length === 0) { panel = buildErrorPanel("SLIDE", ["Provide texts separated by |"]); break; }
                    chatState[chatId].slide = { active: true, targetId: Number(msg.reply_to_message.from.id), replyToMsgId: msg.reply_to_message.message_id, texts: st };
                    saveStateAndSync(); runSlide(chatId);
                    panel = buildResponsePanel("Infinite Scroll Active", [
                        `Target ID: ${msg.reply_to_message.from.id}`,
                        `${st.length} slides prepared.`,
                        `Unending blitz strikes.`,
                        ``, `Status: ACTIVE`
                    ], [[{ text: "Stop Slide", callback_data: "action:dslide" }]]);
                    break;
                }

                case "!dslide": {
                    forceReloadState();
                    if (chatState[chatId].slide) chatState[chatId].slide.active = false;
                    saveStateAndSync();
                    panel = buildResponsePanel("Scroll Frozen", [
                        `The scroll rests.`, `Eternity paused.`, `The shadows wait.`
                    ]);
                    break;
                }

                case "!vn": {
                    if (!msg.reply_to_message) { panel = buildErrorPanel("VN", ["Reply to a message first."]); break; }
                    if (args.join(" ").length === 0) { panel = buildErrorPanel("VN", ["Provide text for the voice note."]); break; }
                    const vt = args.join(" ");
                    chatState[chatId].vn = { active: true, text: vt, replyToMsgId: msg.reply_to_message.message_id, targetId: Number(msg.reply_to_message.from.id) };
                    saveStateAndSync(); runVN(chatId);
                    panel = buildResponsePanel("Void Echo Invoked", [
                        `Target ID: ${msg.reply_to_message.from.id}`,
                        `Words echo through the abyss.`,
                        `Looping forever.`, ``, `Status: ACTIVE`
                    ], [[{ text: "Stop VN", callback_data: "action:dvn" }]]);
                    break;
                }

                case "!dvn": {
                    forceReloadState();
                    if (chatState[chatId].vn) chatState[chatId].vn.active = false;
                    saveStateAndSync();
                    panel = buildResponsePanel("Void Silenced", [
                        `The echo fades.`, `Silence takes over.`, `But the void remembers.`
                    ]);
                    break;
                }

                case "!photoreload": {
                    if (args.length === 0) { panel = buildErrorPanel("PHOTORELOAD", ["Usage: !photoreload <1-5>"]); break; }
                    const sn = parseInt(args[0]);
                    if (isNaN(sn) || sn < 1 || sn > 5) { panel = buildErrorPanel("PHOTORELOAD", ["Invalid slot. Use 1-5."]); break; }
                    if (!msg.reply_to_message || !msg.reply_to_message.photo) { panel = buildErrorPanel("PHOTORELOAD", [`Reply to a photo with !photoreload ${sn}`]); break; }
                    const pi = sn - 1;
                    const ph = getReloadPhotos(chatId);
                    const fid = msg.reply_to_message.photo.pop().file_id;
                    while (ph.length <= pi) ph.push(null);
                    ph[pi] = { fileId: fid, index: sn };
                    chatState.photoreload[chatId] = ph;
                    saveStateAndSync();
                    const vc = ph.filter(p => p !== null).length;
                    panel = buildResponsePanel("Armory Loaded", [
                        `Slot: ${sn} stored`,
                        `Arsenal: ${vc}/5 photos ready`,
                        `Random fury awaits the marked ones.`
                    ]);
                    break;
                }

                case "!resetphoto": {
                    chatState.photoreload[chatId] = [];
                    saveStateAndSync();
                    panel = buildResponsePanel("Armory Cleared", [
                        `All images erased.`,
                        `The void consumes everything.`,
                        `Reload fresh photos.`
                    ]);
                    break;
                }

                case "!photoreply": {
                    if (!msg.reply_to_message) { panel = buildErrorPanel("PHOTOREPLY", ["Reply to a user's message."]); break; }
                    const pl2 = getReloadPhotos(chatId);
                    if (pl2.filter(p => p !== null).length === 0) { panel = buildErrorPanel("PHOTOREPLY", ["No reloaded photos. Use !photoreload 1-5 first."]); break; }
                    const tgu = Number(msg.reply_to_message.from.id);
                    const ct = args.join(" ") || "🔥";
                    ensurePhotoReply(chatId)[tgu] = { active: true, caption: ct };
                    saveStateAndSync();
                    panel = buildResponsePanel("Photo Retaliation Active", [
                        `Target ID: ${tgu}`, `Caption: "${ct}"`,
                        `Every word triggers an image.`,
                        `Relentless fury.`
                    ], [[{ text: "Stop Retaliation", callback_data: "action:dphotoreply" }]]);
                    break;
                }

                case "!dphotoreply": {
                    if (!msg.reply_to_message) { panel = buildErrorPanel("PHOTOREPLY", ["Reply to a user's message."]); break; }
                    const su = Number(msg.reply_to_message.from.id);
                    const pr2 = ensurePhotoReply(chatId);
                    if (pr2[su]) {
                        delete pr2[su]; saveStateAndSync();
                        panel = buildResponsePanel("Retaliation Ceased", [
                            `Target ID: ${su}`,
                            `No more images. No more fury.`,
                            `The shadows withdraw...`
                        ]);
                    } else panel = buildErrorPanel("PHOTOREPLY", ["No active photo reply for that user."]);
                    break;
                }

                case "!photospam": {
                    if (!msg.reply_to_message || !msg.reply_to_message.photo) { panel = buildErrorPanel("PHOTOSPAM", ["Reply to a photo to start spamming."]); break; }
                    const spid = msg.reply_to_message.photo.pop().file_id;
                    ensurePhotoSpam(chatId);
                    chatState.photospam[chatId] = { active: true, photoFileId: spid };
                    saveStateAndSync(); runPhotoSpam(chatId);
                    panel = buildResponsePanel("Photo Spam Active", [
                        `Infinite image barrage unleashed.`,
                        `No cooldown. ${chatState.delay.photospam || 2000}ms between strikes.`,
                        `No escape from the storm.`, ``, `Status: ACTIVE`
                    ], [[{ text: "Stop Photospam", callback_data: "action:dphotospam" }]]);
                    break;
                }

                case "!dphotospam": {
                    forceReloadState();
                    const ps = ensurePhotoSpam(chatId);
                    if (ps.active) {
                        ps.active = false; saveStateAndSync();
                        panel = buildResponsePanel("Photo Spam Ceased", [
                            `The storm ends.`, `The barrage is over.`,
                            `But the shadows never rest.`
                        ]);
                    } else panel = buildErrorPanel("PHOTOSPAM", ["No active photo spam."]);
                    break;
                }

                case "!mute": {
                    let mi = msg.reply_to_message ? Number(msg.reply_to_message.from.id) : Number(args[0]);
                    if (!mi || isNaN(mi)) { panel = buildErrorPanel("MUTE", ["Reply to a user or provide an ID."]); break; }
                    if (OWNER_IDS.includes(mi)) { panel = buildErrorPanel("MUTE", ["Cannot mute the Owner."]); break; }
                    const ml = ensureList(chatId, 'muted');
                    if (!ml.includes(mi)) { ml.push(mi); saveStateAndSync(); }
                    panel = buildResponsePanel("Eternal Silence Active", [
                        `Target ID: ${mi}`, `All messages erased.`,
                        `No escape. Only void.`, `Forever silenced.`
                    ], [[{ text: "Unmute", callback_data: `action:unmute:${mi}` }]]);
                    break;
                }

                case "!unmute": {
                    let ui = msg.reply_to_message ? Number(msg.reply_to_message.from.id) : Number(args[0]);
                    if (!ui || isNaN(ui)) { panel = buildErrorPanel("UNMUTE", ["Reply or provide an ID."]); break; }
                    const ul = ensureList(chatId, 'muted');
                    if (ul.includes(ui)) {
                        chatState.muted[chatId] = ul.filter(id => id !== ui);
                        saveStateAndSync();
                        panel = buildResponsePanel("Silence Broken", [
                            `Target ID: ${ui}`,
                            `The voice returns from the void.`,
                            `Freedom granted.`
                        ]);
                    } else panel = buildErrorPanel("UNMUTE", ["User is not muted."]);
                    break;
                }

                case "!mutelist": {
                    forceReloadState();
                    const mlc = ensureList(chatId, 'muted');
                    if (mlc.length === 0) {
                        panel = buildResponsePanel("Silence List", [
                            `No one is muted.`, `This group is free.`
                        ]);
                    } else {
                        const lines = [`Total: ${mlc.length} souls silenced.`, ``];
                        mlc.forEach((id, i) => { lines.push(`${i+1}. ${id}`); });
                        lines.push(``, `They speak into the endless void.`);
                        panel = buildResponsePanel("Silence List", lines);
                    }
                    break;
                }

                case "!sudo": {
                    let ni = msg.reply_to_message ? Number(msg.reply_to_message.from.id) : Number(args[0]);
                    if (!ni || isNaN(ni)) { panel = buildErrorPanel("SUDO", ["Reply or provide an ID."]); break; }
                    if (!chatState.admins.includes(ni)) { chatState.admins.push(ni); saveStateAndSync(); }
                    panel = buildResponsePanel("Ascended to Power", [
                        `Target ID: ${ni}`,
                        `Power of AIMGOD granted.`,
                        `Rise above all.`
                    ], [[{ text: "Remove Admin", callback_data: `action:rmsudo:${ni}` }]]);
                    break;
                }

                case "!rmsudo": {
                    let ri = msg.reply_to_message ? Number(msg.reply_to_message.from.id) : Number(args[0]);
                    if (!ri || isNaN(ri)) { panel = buildErrorPanel("RMSUDO", ["Reply or provide an ID."]); break; }
                    if (OWNER_IDS.includes(ri)) { panel = buildErrorPanel("RMSUDO", ["Cannot remove the Owner."]); break; }
                    if (chatState.admins.includes(ri)) { chatState.admins = chatState.admins.filter(id => id !== ri); saveStateAndSync(); }
                    panel = buildResponsePanel("Demised from Power", [
                        `Target ID: ${ri}`,
                        `Power fades to darkness.`,
                        `Fallen from grace.`
                    ]);
                    break;
                }

                case "!on": {
                    panel = buildResponsePanel("AIMGOD Awakened", [
                        `I am here, my master AIMGOD.`,
                        `Your enemies... I see them all.`,
                        `They will fall. One by one. Without mercy.`,
                        `Just give the order, and they are gone.`
                    ]);
                    break;
                }

                case "!autopin": {
                    chatState.autopin[chatId] = true;
                    saveStateAndSync();
                    panel = buildResponsePanel("Auto-Pin Activated", [
                        `The sacred scrolls shall be pinned.`,
                        `Every message sealed at the top.`,
                        `Eternal seal. Judgment is absolute.`
                    ], [[{ text: "Deactivate Pin", callback_data: "action:dautopin" }]]);
                    break;
                }

                case "!dautopin": {
                    chatState.autopin[chatId] = false;
                    saveStateAndSync();
                    panel = buildResponsePanel("Auto-Pin Deactivated", [
                        `The winds of chaos calm.`,
                        `Messages flow freely now.`,
                        `Destiny unbound.`
                    ]);
                    break;
                }

                case "!reactall": {
                    if (args.length === 0) { panel = buildErrorPanel("REACTALL", ["No emoji provided.", "Example: !reactall 🔥"]); break; }
                    const rae = args[0];
                    if (!rae.match(/[\u{1F600}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{2600}-\u{26FF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{1FB00}-\u{1FBFF}]|[\u{1FC00}-\u{1FCFF}]|[\u{1FD00}-\u{1FDFF}]|[\u{1FE00}-\u{1FEFF}]|[\u{1FF00}-\u{1FFFF}]/u)) {
                        panel = buildErrorPanel("REACTALL", ["Invalid emoji.", "Use a real emoji like 🔥 ❤️ 👍"]);
                        break;
                    }
                    chatState.reactions[chatId].reactall = { active: true, emoji: rae };
                    if (chatState.reactions[chatId].react) chatState.reactions[chatId].react.active = false;
                    saveStateAndSync();
                    panel = buildResponsePanel("React All Active", [
                        `Reacting to ALL messages with: ${rae}`,
                        `Every word blessed.`,
                        `The shadows acknowledge every soul.`
                    ], [[{ text: "Stop Reactions", callback_data: "action:stopreact" }]]);
                    break;
                }

                case "!react": {
                    if (!msg.reply_to_message) { panel = buildErrorPanel("REACT", ["Reply to a user's message."]); break; }
                    if (args.length === 0) { panel = buildErrorPanel("REACT", ["No emoji provided.", "Example: !react ❤️"]); break; }
                    const re = args[0];
                    if (!re.match(/[\u{1F600}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{2600}-\u{26FF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{1FB00}-\u{1FBFF}]|[\u{1FC00}-\u{1FCFF}]|[\u{1FD00}-\u{1FDFF}]|[\u{1FE00}-\u{1FEFF}]|[\u{1FF00}-\u{1FFFF}]/u)) {
                        panel = buildErrorPanel("REACT", ["Invalid emoji.", "Use a real emoji like 🔥 ❤️ 👍"]);
                        break;
                    }
                    const tu = Number(msg.reply_to_message.from.id);
                    chatState.reactions[chatId].react = { active: true, targetId: tu, emoji: re };
                    if (chatState.reactions[chatId].reactall) chatState.reactions[chatId].reactall.active = false;
                    saveStateAndSync();
                    panel = buildResponsePanel("Reaction Locked", [
                        `Target ID: ${tu}`, `Emoji: ${re}`,
                        `Every word they speak shall be blessed.`
                    ], [[{ text: "Stop Reactions", callback_data: "action:stopreact" }]]);
                    break;
                }

                case "!stopreact": {
                    forceReloadState();
                    const rs = ensureReactions(chatId);
                    let stopped = false;
                    if (rs.reactall && rs.reactall.active) { rs.reactall.active = false; stopped = true; }
                    if (rs.react && rs.react.active) { rs.react.active = false; stopped = true; }
                    saveStateAndSync();
                    if (stopped) {
                        panel = buildResponsePanel("Reactions Stopped", [
                            `The divine energy withdrawn.`,
                            `No more reactions will be sent.`,
                            `The shadows fall silent.`
                        ]);
                    } else panel = buildErrorPanel("REACT", ["No active reactions to stop."]);
                    break;
                }

                case "!stopall": {
                    forceReloadState();
                    const cs2 = chatState[chatId] || {};
                    let stoppedModules = [];

                    if (cs2.nc?.active) { cs2.nc.active = false; stoppedModules.push("Name Change"); }
                    if (cs2.desnc?.active) { cs2.desnc.active = false; stoppedModules.push("Desc Change"); }
                    if (cs2.spam?.active) { cs2.spam.active = false; stoppedModules.push("Spam"); }
                    if (cs2.aspam?.active) { cs2.aspam.active = false; stoppedModules.push("Target Spam"); }
                    if (chatState.fdspam?.[chatId]?.active) { chatState.fdspam[chatId].active = false; stoppedModules.push("Forward Spam"); }
                    if (chatState.pollspam?.[chatId]?.active) { chatState.pollspam[chatId].active = false; stoppedModules.push("Poll Spam"); }
                    if (chatState.panelspam?.[chatId]?.active) { chatState.panelspam[chatId].active = false; stoppedModules.push("Panel Spam"); }
                    if (cs2.hunt?.active) { cs2.hunt.active = false; stoppedModules.push("Hunt"); }
                    if (cs2.slide?.active) { cs2.slide.active = false; stoppedModules.push("Slide"); }
                    if (cs2.vn?.active) { cs2.vn.active = false; stoppedModules.push("Voice Note"); }
                    if (cs2.pfp?.active) { cs2.pfp.active = false; stoppedModules.push("PFP Change"); }
                    if (chatState.photospam?.[chatId]?.active) { chatState.photospam[chatId].active = false; stoppedModules.push("Photo Spam"); }
                    if (chatState.reactions?.[chatId]?.reactall?.active) { chatState.reactions[chatId].reactall.active = false; stoppedModules.push("React All"); }
                    if (chatState.reactions?.[chatId]?.react?.active) { chatState.reactions[chatId].react.active = false; stoppedModules.push("React Target"); }
                    if (chatState.ncLock?.[chatId]) chatState.ncLock[chatId] = { lastUpdate: 0, holder: null };

                    saveStateAndSync();

                    if (stoppedModules.length === 0) {
                        panel = buildResponsePanel("Emergency Stop", [
                            `Nothing to stop.`,
                            `All modules are already idle.`,
                            `The shadows rest quietly.`
                        ]);
                    } else {
                        const lines = [`Deactivated Modules:`, ``];
                        stoppedModules.forEach(m => lines.push(`- ${m}`));
                        lines.push(``, `================================`);
                        lines.push(`Total Stopped: ${stoppedModules.length}`);
                        lines.push(`All shadows retreat. The war pauses.`);
                        panel = buildResponsePanel("Emergency Stop Executed", lines);
                    }
                    break;
                }

                default: break;
            }
            if (panel) await sendPanel(bot, chatId, panel, msg);
        }
    });

    bot.on("callback_query", async (query) => {
        const data = query.data || "";
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const fromId = query.from.id;

        forceReloadState();
        if (!isAdmin(fromId)) {
            bot.answerCallbackQuery(query.id, { text: "Unauthorized.", show_alert: true }).catch(() => {});
            return;
        }

        if (data.startsWith("pspam:")) {
            bot.answerCallbackQuery(query.id, { text: "Button clicked" }).catch(() => {});
            return;
        }

        if (data.startsWith("cmd:")) {
            try {
                const cmd = Buffer.from(data.split(":")[1], 'base64').toString('utf-8');
                bot.answerCallbackQuery(query.id, { text: `Command: ${cmd}`, show_alert: true }).catch(() => {});
            } catch (e) { bot.answerCallbackQuery(query.id).catch(() => {}); }
            return;
        }

        if (data.startsWith("action:")) {
            const parts = data.split(":");
            const action = parts[1];
            forceReloadState();

            switch (action) {
                case "dspam": if (chatState[chatId]?.spam) chatState[chatId].spam.active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: "Spam stopped" }).catch(() => {}); break;
                case "dhunt": if (chatState.hunt?.[chatId]) chatState.hunt[chatId].active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: "Hunt stopped" }).catch(() => {}); break;
                case "dnc": if (chatState[chatId]?.nc) chatState[chatId].nc.active = false; if (chatState.ncLock?.[chatId]) chatState.ncLock[chatId] = { lastUpdate: 0, holder: null }; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: "NC stopped" }).catch(() => {}); break;
                case "desdnc": if (chatState[chatId]?.desnc) chatState[chatId].desnc.active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: "DesNC stopped" }).catch(() => {}); break;
                case "dpfp": if (chatState[chatId]?.pfp) chatState[chatId].pfp.active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: "PFP stopped" }).catch(() => {}); break;
                case "daspam": if (chatState[chatId]?.aspam) chatState[chatId].aspam.active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: "Aspam stopped" }).catch(() => {}); break;
                case "dfdspam": if (chatState.fdspam?.[chatId]) chatState.fdspam[chatId].active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: "Forward spam stopped" }).catch(() => {}); break;
                case "dpollspam": if (chatState.pollspam?.[chatId]) chatState.pollspam[chatId].active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: "Poll spam stopped" }).catch(() => {}); break;
                case "dpanelspam": if (chatState.panelspam?.[chatId]) chatState.panelspam[chatId].active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: "Panel spam stopped" }).catch(() => {}); break;
                case "dslide": if (chatState[chatId]?.slide) chatState[chatId].slide.active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: "Slide stopped" }).catch(() => {}); break;
                case "dvn": if (chatState[chatId]?.vn) chatState[chatId].vn.active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: "VN stopped" }).catch(() => {}); break;
                case "dphotospam": if (chatState.photospam?.[chatId]) chatState.photospam[chatId].active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: "Photo spam stopped" }).catch(() => {}); break;
                case "stopreact":
                    if (chatState.reactions?.[chatId]?.reactall) chatState.reactions[chatId].reactall.active = false;
                    if (chatState.reactions?.[chatId]?.react) chatState.reactions[chatId].react.active = false;
                    saveStateAndSync();
                    bot.answerCallbackQuery(query.id, { text: "Reactions stopped" }).catch(() => {});
                    break;
                case "dautopin": chatState.autopin[chatId] = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: "Auto-pin off" }).catch(() => {}); break;
                case "unmute":
                    const uid = Number(parts[2]);
                    if (uid && chatState.muted?.[chatId]) {
                        chatState.muted[chatId] = chatState.muted[chatId].filter(id => id !== uid);
                        saveStateAndSync();
                    }
                    bot.answerCallbackQuery(query.id, { text: `Unmuted ${uid}` }).catch(() => {});
                    break;
                case "rmsudo":
                    const rid = Number(parts[2]);
                    if (rid && chatState.admins.includes(rid) && !OWNER_IDS.includes(rid)) {
                        chatState.admins = chatState.admins.filter(id => id !== rid);
                        saveStateAndSync();
                    }
                    bot.answerCallbackQuery(query.id, { text: `Removed ${rid}` }).catch(() => {});
                    break;
                default: bot.answerCallbackQuery(query.id).catch(() => {});
            }
            return;
        }

        if (data === "menu:close") {
            bot.answerCallbackQuery(query.id, { text: "Menu closed." }).catch(() => {});
            bot.deleteMessage(chatId, messageId).catch(() => {});
            return;
        }

        if (data === "menu:main") {
            bot.answerCallbackQuery(query.id).catch(() => {});
            bot.editMessageText(buildMainMenuText(), {
                chat_id: chatId, message_id: messageId,
                parse_mode: "Markdown",
                reply_markup: buildMainMenuKeyboard()
            }).catch(() => {});
            return;
        }

        if (data.startsWith("menu:")) {
            const sectionId = data.split(":")[1];
            if (sectionId === "status") {
                bot.answerCallbackQuery(query.id, { text: "Refreshing..." }).catch(() => {});
                bot.editMessageText(buildStatusText(chatId), {
                    chat_id: chatId, message_id: messageId,
                    parse_mode: "Markdown",
                    reply_markup: buildSectionKeyboard("status")
                }).catch(() => {});
                return;
            }
            if (MENU_SECTIONS[sectionId]) {
                bot.answerCallbackQuery(query.id).catch(() => {});
                bot.editMessageText(buildSectionText(sectionId, chatId), {
                    chat_id: chatId, message_id: messageId,
                    parse_mode: "Markdown",
                    reply_markup: buildSectionKeyboard(sectionId)
                }).catch(() => {});
            } else {
                bot.answerCallbackQuery(query.id, { text: "Section not found." }).catch(() => {});
            }
            return;
        }

        bot.answerCallbackQuery(query.id).catch(() => {});
    });

    bot.on("new_chat_title", async (msg) => {
        const fromId = msg.from ? Number(msg.from.id) : null;
        const chatId = msg.chat.id;
        forceReloadState();
        const ml = ensureList(chatId, 'muted');
        if (fromId && ml.includes(fromId)) bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    });

    bot.on("new_chat_photo", async (msg) => {
        const fromId = msg.from ? Number(msg.from.id) : null;
        const chatId = msg.chat.id;
        forceReloadState();
        const ml = ensureList(chatId, 'muted');
        if (fromId && ml.includes(fromId)) {
            bot.deleteMessage(chatId, msg.message_id).catch(() => {});
            const me = await bot.getMe().catch(() => {});
            if (me && fromId !== me.id) bot.deleteChatPhoto(chatId).catch(() => {});
        }
    });

    bot.on("delete_chat_photo", async (msg) => {
        const fromId = msg.from ? Number(msg.from.id) : null;
        const chatId = msg.chat.id;
        forceReloadState();
        const ml = ensureList(chatId, 'muted');
        if (fromId && ml.includes(fromId)) bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    });
}

console.log("AIMGOD ULTIMATE V6 - SHARED NC 200ms READY");