import type { NotificationProvider } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

function envVar(name: string): string | undefined {
  return process.env[name];
}

async function postTelegram(token: string, chat: string, text: string): Promise<void> {
  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram API ${res.status}: ${body}`);
  }
}

export const telegram: NotificationProvider = {
  id: "telegram",
  async init() {
    // No-op for now; validate config
    const token = envVar("TELEGRAM_BOT_TOKEN");
    const chat = envVar("TELEGRAM_CHAT_ID");
    if (!token || !chat) {
      console.warn("[notifications][telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — notifications disabled");
    }
  },
  async notifyPick({ username, matchLabel, outcome, chatId }) {
    const token = envVar("TELEGRAM_BOT_TOKEN");
    const chat = chatId ?? envVar("TELEGRAM_CHAT_ID");
    if (!token || !chat) return;
    const text = `📣 ${username} placed a pick: ${matchLabel} · ${outcome.toUpperCase()}`;
    try {
      await postTelegram(token, chat, text);
    } catch (e) {
      console.warn("[notifications][telegram] notifyPick failed:", e);
    }
  },
  async notifyReceipt({ marketId, txHash, chatId }) {
    const token = envVar("TELEGRAM_BOT_TOKEN");
    const chat = chatId ?? envVar("TELEGRAM_CHAT_ID");
    if (!token || !chat) return;
    const text = `🔏 Receipt published: ${marketId} → ${txHash}`;
    try {
      await postTelegram(token, chat, text);
    } catch (e) {
      console.warn("[notifications][telegram] notifyReceipt failed:", e);
    }
  },
  async notifyRevive({ username, rebateCkb, coPickers, chatId }) {
    const token = envVar("TELEGRAM_BOT_TOKEN");
    const chat = chatId ?? envVar("TELEGRAM_CHAT_ID");
    if (!token || !chat) return;
    const who = coPickers.length ? ` (co-pickers: ${coPickers.join(", ")})` : "";
    const text = `💸 ${username} revived their streak — rebate ${rebateCkb} CKB${who}`;
    try {
      await postTelegram(token, chat, text);
    } catch (e) {
      console.warn("[notifications][telegram] notifyRevive failed:", e);
    }
  },
};
