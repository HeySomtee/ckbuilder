/** Public, key-free atomic prediction contracts. Money is integer shannons. */
export interface BatchScript {
  codeHash: string;
  hashType: 'data' | 'type' | 'data1' | 'data2';
  args: string;
}
export interface BatchPoint {
  txHash: string;
  index: number;
}
export interface BatchTerms {
  provider: 'football';
  providerFixtureId: string;
  source: 'api-football';
  rules: 'regulation-time-1x2-v1';
  deadlineMs: number;
}
export interface BatchDescriptor {
  id: string;
  fixtureId: string;
  label: string;
  cutoffMs: number;
  creationTxHash: string;
  type: BatchScript & { hashType: 'data2' };
  termsHash: string;
  terms: BatchTerms;
  entryEnabled: boolean;
  entryUnavailableReason?: string;
}
export interface BatchFixture {
  fixtureId: string;
  label: string;
  cutoffMs: number;
  terms: BatchTerms;
  termsHash: string;
  state: 'available' | 'reserved' | 'confirming' | 'funded' | 'unavailable';
  sponsorLock: BatchScript;
  descriptor?: BatchDescriptor;
}
export interface BatchInput {
  outPoint: BatchPoint;
  capacityShannons: string;
  lock: BatchScript;
  type?: BatchScript;
  data: string;
}
export interface BatchPick {
  fixtureId: string;
  termsHash: string;
  outcome: 0 | 1 | 2;
  principalShannons: string;
}
export interface BatchOfferRequest {
  requestId: string;
  ownerAddress: string;
  userInputs: BatchPoint[];
  picks: BatchPick[];
}
export interface BatchLine {
  fixture: BatchFixture;
  descriptor: BatchDescriptor;
  mode: 'create' | 'deposit';
  outcome: 0 | 1 | 2;
  principalShannons: string;
  shard: number;
  outputIndex: number;
  outputCount: 1 | 5;
  shardInputIndex?: number;
  controlDep?: BatchPoint;
  headerHash?: string;
}
export interface BatchOffer {
  version: 'atomic-predictions-v1';
  offerId: string;
  expiresAt: number;
  rawHash: string;
  unsignedBytes: string;
  sponsorLock: BatchScript;
  ownerLock: BatchScript;
  sponsorInput: BatchPoint;
  userInputIndexes: number[];
  inputs: BatchInput[];
  lines: BatchLine[];
  reserveShannons: string;
  principalShannons: string;
  storageShannons: string;
  feeShannons: string;
  sponsorChangeOutputIndex: number;
  ownerChangeOutputIndex: number;
  /** First-line aliases retained by the shared durable sponsorship engine. */
  fixture: BatchFixture;
  descriptor: BatchDescriptor;
  outcome: 0 | 1 | 2;
}
export type BatchState =
  | 'offered'
  | 'owner-signed'
  | 'signed'
  | 'confirming'
  | 'funded'
  | 'expired'
  | 'cancelled'
  | 'blocked';
export interface BatchStatus {
  offer: BatchOffer;
  state: BatchState;
  signedBytes?: string;
  transactionHash: string;
  message?: string;
}
export interface BatchIdentity {
  offerId: string;
  rawHash: string;
}
export interface BatchSubmit extends BatchIdentity {
  userSignedBytes: string;
}
export interface BatchTransport {
  offer(request: BatchOfferRequest): Promise<BatchOffer>;
  submit(request: BatchSubmit): Promise<BatchStatus>;
  status(identity: BatchIdentity): Promise<BatchStatus>;
  resume(identity: BatchIdentity): Promise<BatchStatus>;
  resolve(request: BatchIdentity & { conflictingTxHash: string }): Promise<BatchStatus>;
}
