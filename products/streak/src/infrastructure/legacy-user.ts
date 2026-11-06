import type { User } from '../types';

/** Shared legacy backfill for full-store reads and bounded settlement reads. */
export function upgradeUser(u: User): User {
  return {
    id: u.id,
    walletIdentity: u.walletIdentity ?? '',
    walletType: u.walletType ?? '',
    username: u.username,
    telegramChatId: u.telegramChatId,
    telegramUsername: u.telegramUsername,
    createdAt: u.createdAt,
    wallet: { address: u.wallet?.address },
    escrowShannons: u.escrowShannons ?? '0',
    creatorFeesShannons: u.creatorFeesShannons ?? '0',
    streak: {
      current: u.streak?.current ?? 0,
      best: u.streak?.best ?? 0,
      status: u.streak?.status ?? 'active',
      lastPickDate: u.streak?.lastPickDate,
      failedBetId: u.streak?.failedBetId,
    },
    stats: {
      totalBets: u.stats?.totalBets ?? 0,
      wonBets: u.stats?.wonBets ?? 0,
      lostBets: u.stats?.lostBets ?? 0,
      renews: u.stats?.renews ?? 0,
      netPnlShannons: u.stats?.netPnlShannons ?? '0',
      turnoverShannons: u.stats?.turnoverShannons ?? '0',
    },
  };
}
