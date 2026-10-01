import { useEffect, useState } from 'react';

export function useCountdown(target) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!target) {
      setRemaining(null);
      return undefined;
    }
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      setRemaining(diff > 0 ? diff : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (remaining === null) return { ended: false, text: '' };
  const ended = remaining <= 0;
  const s = Math.floor(remaining / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return {
    ended,
    text: ended ? 'Ended' : `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`,
  };
}
