import type { ccc } from '@ckb-ccc/connector';

export interface ActiveWallet {
  readonly signer: ccc.Signer;
  readonly address: string;
  readonly revision: number;
}
interface WalletState {
  readonly connection: ActiveWallet | null;
  readonly revision: number;
  readonly notice: string | null;
}

// Only a prior explicit selection permits silent restoration. Public metadata
// is a hint, never proof of account access or permission to sign.
const REMEMBERED_WALLET = 'streak-wallet-selection-v1';
let restoration: Promise<void> | undefined;
function forgetWallet() {
  try {
    localStorage.removeItem(REMEMBERED_WALLET);
  } catch {
    /* Storage can be disabled. */
  }
}
let state: WalletState = { connection: null, revision: 0, notice: null };
const listeners = new Set<() => void>();
let stopReplacement: (() => void) | undefined;
let cancelSelection: (() => void) | undefined;
let selection: Promise<ccc.Signer> | undefined;
export const getWalletState = (): WalletState => state;
export function subscribeWallet(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(connection: ActiveWallet | null, notice: string | null) {
  state = { connection, revision: state.revision + 1, notice };
  listeners.forEach((listener) => listener());
}
export function disconnectWallet(
  notice = 'Wallet disconnected. Reconnect when you are ready.',
  expected?: ActiveWallet,
): void {
  if (expected && state.connection !== expected) return;
  forgetWallet();
  cancelSelection?.();
  stopReplacement?.();
  stopReplacement = undefined;
  publish(null, notice);
}

/** Restore only an already-authorized EVM wallet. Never request access or sign. */
export async function restoreWallet(expectedAddress?: string): Promise<void> {
  if (state.connection || selection) return;
  if (restoration) return restoration;
  let hint: { address: string; name: string; until: number };
  try {
    const value: unknown = JSON.parse(localStorage.getItem(REMEMBERED_WALLET) ?? 'null');
    if (
      !value ||
      typeof value !== 'object' ||
      !('address' in value) ||
      !('name' in value) ||
      !('until' in value) ||
      typeof value.address !== 'string' ||
      !value.address.startsWith('ckt1') ||
      value.address.length > 300 ||
      typeof value.name !== 'string' ||
      value.name.length > 100 ||
      typeof value.until !== 'number' ||
      value.until <= Date.now() ||
      (expectedAddress && value.address !== expectedAddress)
    )
      return;
    hint = { address: value.address, name: value.name, until: value.until };
  } catch {
    return;
  }
  const revision = state.revision;
  const pending = (async () => {
    const { ccc } = await import('@ckb-ccc/connector');
    if (state.revision !== revision || selection) return;
    const candidates: InstanceType<typeof ccc.Eip6963.Signer>[] = [];
    const stop = new ccc.Eip6963.SignerFactory(
      new ccc.ClientPublicTestnet({
        url: 'https://testnet.ckb.dev/',
        fallbacks: [],
        timeout: 15_000,
        maxConcurrent: 4,
      }),
    ).subscribeSigners((signer, detail) => {
      if (
        (detail?.info.name ?? 'EVM') === hint.name &&
        !candidates.some((s) => s.provider === signer.provider)
      )
        candidates.push(signer);
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    stop();
    if (candidates.length !== 1 || state.revision !== revision || selection) return;
    const signer = candidates[0];
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          if (
            !(await signer.isConnected()) ||
            (await signer.getRecommendedAddress()) !== hint.address
          )
            return;
          if (timedOut || state.revision !== revision || selection) return;
          await retainWallet(
            signer,
            revision,
            (address) => !timedOut && !selection && address === hint.address,
          );
        })(),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            timedOut = true;
            resolve();
          }, 4_000);
        }),
      ]);
    } catch {
      /* Locked/revoked wallets remain disconnected; explicit Connect is available. */
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();
  restoration = pending;
  try {
    await pending;
  } finally {
    if (restoration === pending) restoration = undefined;
  }
}
export async function assertActiveWallet(connection: ActiveWallet): Promise<void> {
  const changed = () => state.connection !== connection;
  if (changed()) throw Error('The connected wallet changed. Connect again and review your action.');
  try {
    if (
      !(await connection.signer.isConnected()) ||
      (await connection.signer.getRecommendedAddress()) !== connection.address ||
      connection.signer.client.addressPrefix !== 'ckt'
    )
      throw Error('Your wallet account or network changed. Connect again and review your action.');
    if (changed())
      throw Error('The connected wallet changed. Connect again and review your action.');
  } catch (error) {
    if (!changed())
      disconnectWallet('Your wallet connection changed. Connect again to continue.', connection);
    throw error;
  }
}
export async function assertWalletAccount(
  connection: ActiveWallet,
  address: string,
): Promise<void> {
  const { ccc } = await import('@ckb-ccc/core');
  await assertActiveWallet(connection);
  const connected = await ccc.Address.fromString(connection.address, connection.signer.client);
  const account = await ccc.Address.fromString(address, connection.signer.client);
  if (!connected.script.eq(account.script))
    throw Error(
      'This wallet differs from your signed-in account. Connect that wallet or sign out first.',
    );
  await assertActiveWallet(connection);
}

async function retainWallet(
  signer: ccc.Signer,
  revision: number,
  allowed: (address: string) => boolean = () => true,
): Promise<ccc.Signer> {
  if (!(await signer.isConnected())) throw Error('The selected wallet is not connected.');
  const address = await signer.getRecommendedAddress();
  if (signer.client.addressPrefix !== 'ckt') throw Error('Connect a CKB testnet wallet.');
  if (state.revision !== revision || !allowed(address)) throw Error('Wallet connection cancelled.');
  const guarded = new Proxy(signer, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      if (
        ['signMessage', 'signMessageRaw', 'signTransaction', 'signOnlyTransaction'].includes(
          String(property),
        )
      )
        return async (...args: unknown[]) => {
          await assertActiveWallet(connection);
          const result: unknown = await Reflect.apply(value, target, args);
          // Direct transaction callers must retain exact signed bytes before a
          // post-sign account/RPC failure. They revalidate before broadcasting.
          if (property !== 'signTransaction') await assertActiveWallet(connection);
          return result;
        };
      return value.bind(target);
    },
  });
  const connection: ActiveWallet = Object.freeze({
    signer: guarded,
    address,
    revision: revision + 1,
  });
  stopReplacement?.();
  const watchReplacement = () =>
    signer.onReplaced(() => {
      // Some providers repeat accountsChanged with the same account. Revalidate
      // instead of dropping a healthy signer. CCC's listener is one-shot, so rearm.
      if (state.connection !== connection) return;
      stopReplacement?.();
      stopReplacement = watchReplacement();
      void assertActiveWallet(connection).catch(() => {
        /* assertActiveWallet invalidates a changed connection. */
      });
    });
  stopReplacement = watchReplacement();
  publish(connection, null);
  return guarded;
}

/** Reuse an explicitly selected wallet in this page lifetime. Never sign here. */
export async function chooseWallet(): Promise<ccc.Signer> {
  const current = state.connection;
  if (current) {
    try {
      await assertActiveWallet(current);
      return current.signer;
    } catch (error) {
      // A stale connection is cleared by the guard. Let this same user gesture
      // open the chooser; never require a second click just to reconnect.
      if (state.connection) throw error;
    }
  }
  if (selection) return selection;
  const revision = state.revision;
  const pending = (async () => {
    const { ccc, WebComponentConnector } = await import('@ckb-ccc/connector');
    if (state.revision !== revision) throw Error('Wallet connection cancelled.');
    const element = new WebComponentConnector();
    // CCC schedules a delayed discovery refresh when its element is attached.
    // Own that controller so a detached chooser cannot revive its listeners.
    const controller = new ccc.SignersController();
    const refresh = controller.refresh.bind(controller);
    let chooserClosed = false;
    const updateSigner = element.updateSigner.bind(element);
    element.updateSigner = async (...args) => {
      if (chooserClosed) return;
      try {
        await updateSigner(...args);
      } finally {
        if (chooserClosed) await updateSigner(undefined, undefined);
      }
    };
    controller.refresh = async (...args) => {
      if (chooserClosed) return;
      try {
        await refresh(...args);
      } finally {
        if (chooserClosed) controller.disconnect();
      }
    };
    element.signersController = controller;
    element.setClient(
      new ccc.ClientPublicTestnet({
        url: 'https://testnet.ckb.dev/',
        fallbacks: [],
        timeout: 15_000,
        maxConcurrent: 4,
      }),
    );
    element.style.zIndex = '1000';
    // A native slip dialog makes ordinary body overlays inert. Give the chooser
    // its own top-layer host, keeping both the draft and its route in place.
    const modalHost = document.querySelector('dialog[open]')
      ? document.createElement('dialog')
      : null;
    if (modalHost) {
      modalHost.setAttribute('aria-label', 'Choose wallet');
      modalHost.className = 'wallet-chooser-host';
      modalHost.style.cssText =
        'position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;max-width:none;height:100dvh;max-height:none;background:transparent;overflow:visible;';
      modalHost.addEventListener('cancel', (event) => {
        event.preventDefault();
        cancelSelection?.();
      });
    }
    let walletName = '';
    const signer = await new Promise<ccc.Signer>((resolve, reject) => {
      let connecting = false;
      let settled = false;
      const onClose = element.onClose.bind(element);
      // CCC closes before its selection callback assigns the signer.
      element.onClose = (callback) => {
        connecting = !!callback;
        onClose(callback);
      };
      const timeout = setTimeout(
        () => finish(new Error('Wallet connection timed out. Please try again.')),
        120_000,
      );
      function finish(error?: Error) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cancelSelection = undefined;
        const selected = element.signer?.signer;
        walletName = element.wallet?.name ?? 'EVM';
        chooserClosed = true;
        element.refreshSigner = () => {};
        controller.disconnect();
        element.removeEventListener('willUpdate', updated);
        element.removeEventListener('close', closed);
        // Release CCC discovery/replacement listeners without disconnecting the
        // selected provider signer retained by our own connection store.
        void updateSigner(undefined, undefined);
        element.remove();
        modalHost?.close();
        modalHost?.remove();
        if (error) reject(error);
        else if (selected) resolve(selected);
        else reject(new Error('Wallet connection cancelled.'));
      }
      function updated() {
        if (element.signer?.signer) finish();
      }
      function closed() {
        if (!connecting) finish();
      }
      cancelSelection = () => finish(new Error('Wallet connection cancelled.'));
      element.addEventListener('willUpdate', updated);
      element.addEventListener('close', closed);
      if (modalHost) {
        document.body.append(modalHost);
        modalHost.append(element);
        modalHost.showModal();
      } else document.body.append(element);
      updated();
    });
    const retained = await retainWallet(signer, revision);
    if (signer.type === ccc.SignerType.EVM && 'provider' in signer && state.connection) {
      try {
        localStorage.setItem(
          REMEMBERED_WALLET,
          JSON.stringify({
            address: state.connection.address,
            name: walletName,
            until: Date.now() + 7 * 86400_000,
          }),
        );
      } catch {
        /* Remembering is optional. */
      }
    }
    return retained;
  })();
  selection = pending;
  try {
    return await pending;
  } finally {
    if (selection === pending) selection = undefined;
  }
}
