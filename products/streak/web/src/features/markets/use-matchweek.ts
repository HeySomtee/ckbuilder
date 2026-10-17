import { useEffect, useState } from 'react';
import { weekend } from './weekend';

/** Update calendar boundaries even when a cached fixture response is unchanged. */
export function useMatchweek(offset = 0) {
  const [day, setDay] = useState(() => new Date());
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setDay((previous) => (previous.toDateString() === now.toDateString() ? previous : now));
    };
    const visible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  return weekend(offset, day);
}
