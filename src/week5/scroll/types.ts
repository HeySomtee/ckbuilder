/**
 * Week 5 — CKB Scroll: type definitions.
 *
 * A ScrollPost maps 1-to-1 to a CKB cell on the testnet. Once the
 * transaction is committed the post is permanently on-chain.
 */

export type PostStatus = "pending" | "confirmed" | "failed";

export interface ScrollPost {
  /** UUID generated server-side at submission time. */
  id: string;
  /** Message content — max 200 UTF-8 chars. */
  content: string;
  /**
   * Author CKB testnet address (ckt1…). Stored inside the cell data
   * so anyone can verify authorship off-chain.
   */
  authorAddress: string;
  /** On-chain transaction hash — set after broadcast. */
  txHash?: string;
  /** Output index inside the transaction (always 0 for scroll posts). */
  index?: number;
  /** Block number when the transaction was committed. */
  blockNumber?: string;
  /** Shannons locked in the cell (decimal string to avoid JSON bigint issues). */
  capacity?: string;
  status: PostStatus;
  createdAt: string; // ISO-8601
}

export interface ScrollState {
  posts: ScrollPost[];
}

export interface ScrollStats {
  totalPosts: number;
  confirmedPosts: number;
  pendingPosts: number;
  /** Total shannons locked across all confirmed posts (decimal string). */
  totalCapacityLocked: string;
  /** Faucet wallet available balance in shannons (decimal string). */
  faucetBalance: string;
}
