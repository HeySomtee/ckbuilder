import { telegram } from "./telegram";
import type { NotificationProvider } from "./types";

let provider: NotificationProvider | null = null;

export async function initNotifications(): Promise<void> {
  const which = process.env.NOTIFIER ?? process.env.NOTIFY_PROVIDER ?? "none";
  if (which === "telegram") {
    provider = telegram;
    if (provider.init) await provider.init();
    console.log(`[notifications] using provider: ${provider.id}`);
    return;
  }
  console.log("[notifications] no provider configured");
}

export async function notifyPick(opts: { username: string; matchLabel: string; outcome: string; chatId?: string }) {
  if (!provider || !provider.notifyPick) return;
  try {
    await provider.notifyPick(opts as any);
  } catch (e) {
    console.warn("[notifications] notifyPick error", e);
  }
}

export async function notifyReceipt(opts: { marketId: string; txHash: string; chatId?: string }) {
  if (!provider || !provider.notifyReceipt) return;
  try {
    await provider.notifyReceipt(opts as any);
  } catch (e) {
    console.warn("[notifications] notifyReceipt error", e);
  }
}

export async function notifyRevive(opts: { username: string; rebateCkb: string; coPickers: string[]; chatId?: string }) {
  if (!provider || !provider.notifyRevive) return;
  try {
    await provider.notifyRevive(opts as any);
  } catch (e) {
    console.warn("[notifications] notifyRevive error", e);
  }
}
