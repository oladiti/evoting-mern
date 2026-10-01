import { LegalShell, LegalSection, ContactEmail } from './LegalShell';

const cookieTable = [
  ['ev_csrf', 'Cross-site request forgery (CSRF) protection', 'Set on first visit', 'No'],
  ['ev_access', 'Secure, HttpOnly session token that keeps you logged in', 'Per session / as configured', 'Yes'],
  ['ev_refresh', 'Secure, HttpOnly "remember me" token', 'Up to 30 days', 'Yes'],
];

export default function CookiePolicy() {
  return (
    <LegalShell icon="fa-cookie-bite" title="Cookie Policy" subtitle="E-Voting System — OGITECH Student Elections" updated="September 2026">
      <LegalSection heading="1. What Are Cookies?">
        <p>Cookies are small text files stored by your browser on your device. Some are essential for the service to work securely.</p>
      </LegalSection>

      <LegalSection heading="2. Cookies We Use (Essential Only)">
        <p>We do not use tracking, advertising or analytics cookies. The cookies below are strictly necessary for security and functionality.</p>
        <p>Essential cookies are exempt from consent and are always active — rejecting cookies will not remove them, because the service cannot operate securely without them.</p>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
                <th className="py-2 pr-3 font-semibold">Cookie</th>
                <th className="py-2 pr-3 font-semibold">Purpose</th>
                <th className="py-2 pr-3 font-semibold">Duration</th>
                <th className="py-2 font-semibold">HttpOnly</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {cookieTable.map(([name, purpose, duration, httpOnly]) => (
                <tr key={name}>
                  <td className="py-2 pr-3 font-mono text-xs text-slate-800 dark:text-slate-200">{name}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{purpose}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{duration}</td>
                  <td className="py-2 text-slate-600 dark:text-slate-300">{httpOnly}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection heading="3. Local Storage">
        <p>
          Your browser's local storage is used to remember your theme preference (<span className="font-mono text-xs">evoting-theme</span>) and your cookie choice (
          <span className="font-mono text-xs">evoting_cookie_consent</span>), which stores your decision (accepted/rejected) and the date it was made. This stays on your device and is not sent to our
          server.
        </p>
      </LegalSection>

      <LegalSection heading="4. Managing Cookies">
        <p>When you first visit, the consent banner asks whether you accept non-essential cookies:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Accept</strong> — records your consent and enables non-essential cookies if they are ever introduced.
          </li>
          <li>
            <strong>Reject non-essential</strong> — records your preference against any non-essential cookies, and clears any already present. Your choice is stored on your device for the lifetime of
            the site data.
          </li>
        </ul>
        <p>
          Because our essential cookies are required for security and session handling, they remain active regardless of your choice. Clearing them through your browser may require you to log in again
          or re-verify your browser.
        </p>
      </LegalSection>

      <LegalSection heading="5. Changes">
        <p>We will update this page if we ever add additional cookies.</p>
      </LegalSection>

      <LegalSection heading="6. Contact">
        <p>
          Questions: <ContactEmail />.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
