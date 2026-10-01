import { useEffect, useLayoutEffect, useRef } from 'react';

const WIDGET_W = 304;
const WIDGET_H = 78;

// Loads Google reCAPTCHA v2 (checkbox) on demand. When disabled or unconfigured, no-op.
// The widget is a fixed 304x78px iframe, so on narrow containers it is scaled down
// (and its layout height matched) to avoid overflowing the parent card / page.
export default function Recaptcha({ siteKey, enabled, onChange }) {
  const widgetId = useRef(null);
  const rootRef = useRef(null);
  const innerRef = useRef(null);
  const containerRef = useRef(null);
  const changedRef = useRef(false);

  useLayoutEffect(() => {
    if (!enabled || !siteKey) return undefined;
    const root = rootRef.current;
    const inner = innerRef.current;
    if (!root || !inner) return undefined;

    const applyScale = () => {
      const w = root.clientWidth;
      const scale = Math.min(1, w / WIDGET_W);
      inner.style.transform = `scale(${scale})`;
      root.style.height = `${Math.round(WIDGET_H * scale)}px`;
    };
    applyScale();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(applyScale);
      ro.observe(root);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', applyScale);
    return () => window.removeEventListener('resize', applyScale);
  }, [enabled, siteKey]);

  useEffect(() => {
    if (!enabled || !siteKey) {
      onChange?.('');
      return undefined;
    }
    if (changedRef.current) return undefined;

    let mounted = true;
    let t;
    const render = () => {
      if (!mounted || !containerRef.current) return;
      if (widgetId.current !== null) return;
      try {
        widgetId.current = window.grecaptcha.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => {
            changedRef.current = true;
            onChange?.(token);
          },
          'expired-callback': () => onChange?.(''),
        });
      } catch {
        t = setTimeout(render, 200);
      }
    };

    if (window.grecaptcha && window.grecaptcha.render) {
      render();
    } else {
      const existing = document.querySelector('script[src*="recaptcha/api.js"]');
      const s = existing || document.createElement('script');
      if (!existing) {
        s.src = 'https://www.google.com/recaptcha/api.js?render=explicit&onload=__ev_rcaps';
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
      }
      window.__ev_rcaps = render;
    }
    return () => {
      mounted = false;
      if (t) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, siteKey]);

  if (!enabled || !siteKey) return null;
  return (
    <div ref={rootRef} className="flex justify-center overflow-hidden" style={{ height: WIDGET_H }}>
      <div ref={innerRef} style={{ transformOrigin: 'top center' }}>
        <div ref={containerRef} />
      </div>
    </div>
  );
}
