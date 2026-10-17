/** Only availability leaves the API. Credentials and receiver URLs remain private. */
export function telegramAvailable(environment: NodeJS.ProcessEnv, receiverReady: boolean): boolean {
  if (
    !receiverReady ||
    !environment.TELEGRAM_BOT_TOKEN ||
    !environment.TELEGRAM_BOT_USERNAME ||
    !environment.TELEGRAM_WEBHOOK_SECRET ||
    !environment.APP_PUBLIC_URL
  )
    return false;
  try {
    const url = new URL(environment.APP_PUBLIC_URL);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^[A-Za-z0-9_-]{1,256}$/.test(environment.TELEGRAM_WEBHOOK_SECRET) &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
