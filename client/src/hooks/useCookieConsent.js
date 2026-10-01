import { useCallback, useMemo, useState } from 'react';
import { getCookieConsent, recordCookieConsent, canUseNonEssential, clearNonEssentialCookies } from '../lib/consent';

export function useCookieConsent() {
  const [consent, setConsent] = useState(() => getCookieConsent());

  const record = useCallback((decision) => {
    const saved = recordCookieConsent(decision);
    setConsent(saved);
    if (decision === 'rejected') clearNonEssentialCookies();
    return saved;
  }, []);

  return useMemo(
    () => ({
      consent,
      decision: consent?.decision ?? null,
      canUseNonEssential: canUseNonEssential(),
      record,
      clearNonEssentialCookies,
    }),
    [consent, record]
  );
}
