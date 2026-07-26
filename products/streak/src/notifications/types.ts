export interface NotificationProvider {
  id: string;
  init?(): Promise<void>;
  notifyPick?(opts: { username: string; matchLabel: string; outcome: string; chatId?: string }): Promise<void>;
  notifyReceipt?(opts: { marketId: string; txHash: string; chatId?: string }): Promise<void>;
  notifyRevive?(opts: { username: string; rebateCkb: string; coPickers: string[]; chatId?: string }): Promise<void>;
}
