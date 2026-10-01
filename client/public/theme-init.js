// Applies the saved theme before the first paint, so a dark-mode user never sees
// a white flash while React boots.
//
// This lives in a file rather than an inline <script> in index.html on purpose:
// an inline script would force script-src to carry 'unsafe-inline' (or a hash
// that has to be regenerated on every edit), which would give up most of what
// the Content-Security-Policy is for. A plain classic script in <head> is
// render-blocking in the same way an inline one is, so it costs nothing visually
// and keeps the policy strict. It must stay a classic script - a module script
// is deferred and would run after the body had already painted.
var storedTheme = localStorage.getItem('evoting-theme');
if (
  storedTheme === 'dark' ||
  (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
) {
  document.documentElement.classList.add('dark');
}
