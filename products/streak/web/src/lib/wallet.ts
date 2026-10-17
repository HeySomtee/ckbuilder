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

// Importing the shared state must not load CCC, discover extensions or restore
// a wallet on ordinary market browsing. Connections live only in this document.
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
  cancelSelection?.();
  stopReplacement?.();
  stopReplacement = undefined;
  publish(null, notice);
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

async function retainWallet(signer: ccc.Signer, revision: number): Promise<ccc.Signer> {
  if (!(await signer.isConnected())) throw Error('The selected wallet is not connected.');
  const address = await signer.getRecommendedAddress();
  if (signer.client.addressPrefix !== 'ckt') throw Error('Connect a CKB testnet wallet.');
  if (state.revision !== revision) throw Error('Wallet connection cancelled.');
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
          await assertActiveWallet(connection);
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
        maxConcurrent: 2,
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
    return retainWallet(signer, revision);
  })();
  selection = pending;
  try {
    return await pending;
  } finally {
    if (selection === pending) selection = undefined;
  }
}
