import { ccc, WebComponentConnector } from '@ckb-ccc/connector';

/** Loaded only after an explicit sign-in action. No wallet/RPC on market browsing. */
export async function chooseWallet(): Promise<ccc.Signer> {
  const element = new WebComponentConnector();
  element.setClient(
    new ccc.ClientPublicTestnet({
      url: 'https://testnet.ckb.dev/',
      fallbacks: [],
      timeout: 15_000,
      maxConcurrent: 2,
    }),
  );
  element.style.zIndex = '1000';
  return new Promise((resolve, reject) => {
    let connecting = false;
    let settled = false;
    const onClose = element.onClose.bind(element);
    // CCC 1.3 calls close before its selection callback assigns the signer.
    // Preserve that callback and wait for the signer's reactive update.
    element.onClose = (callback) => {
      connecting = !!callback;
      onClose(callback);
    };
    const timeout = setTimeout(
      () => finish(new Error('Wallet connection timed out. Please try again.')),
      120_000,
    );
    function cleanup() {
      clearTimeout(timeout);
      element.removeEventListener('willUpdate', updated);
      element.removeEventListener('close', closed);
      element.remove();
    }
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      const signer = element.signer?.signer;
      cleanup();
      if (error) reject(error);
      else if (signer) resolve(signer);
      else reject(new Error('Wallet connection cancelled.'));
    }
    function updated() {
      if (element.signer?.signer) finish();
    }
    function closed() {
      if (!connecting) finish();
    }
    element.addEventListener('willUpdate', updated);
    element.addEventListener('close', closed);
    document.body.append(element);
    updated();
  });
}
