import { LegalShell, LegalSection, LegalList, LegalLink, ContactEmail } from './LegalShell';

export default function Privacy() {
  return (
    <LegalShell icon="fa-user-shield" title="Privacy Policy" subtitle="E-Voting System — OGITECH Student Elections" updated="September 2026">
      <LegalSection heading="1. Introduction">
        <p>
          This policy explains what personal information the E-Voting System collects, why we collect it, and how we protect it. By registering or voting, you agree to the practices described here.
        </p>
      </LegalSection>

      <LegalSection heading="2. Information We Collect">
        <LegalList
          items={[
            'Identity information — full name, username, email address and matric number you provide at registration.',
            'Contact messages — name, email, subject and message when you use the contact form.',
            'Biometric information — an optional 128-dimension face descriptor and face photo used only for one-time identity verification. Enrollment is optional.',
            'Location information — your device latitude/longitude, captured only at the moment you cast a vote, to confirm you are within the campus geofence. We do not track your location continuously.',
            'Activity logs — a record of significant actions (login, registration, accreditation, voting, face verification) used for audit and security, visible only to administrators.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. How We Use Your Information">
        <LegalList
          items={[
            'To create and manage your voter account and verify your email.',
            'To accredit you for elections and operate the ballot.',
            'To prevent duplicate or fraudulent votes (one vote per eligible voter per position).',
            'To maintain a tamper-resistant audit trail.',
            'To respond to your messages via the contact form.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Legal Basis & Your Rights">
        <p>
          Processing is based on your consent and on the legitimate operation of institutional elections. You may request access to, correction of, or deletion of your personal data by contacting us;
          we will respond within a reasonable time, subject to audit and election-integrity requirements. This policy respects the Nigeria Data Protection Regulation (NDPR).
        </p>
      </LegalSection>

      <LegalSection heading="5. How We Protect Your Data">
        <p>
          Passwords are hashed (bcrypt), sessions use signed HttpOnly cookies, and requests are protected with CSRF tokens, rate limiting, security headers (Helmet) and HTTPS in production. Face
          descriptors are stored as numeric vectors used solely for identity verification, not for any other purpose.
        </p>
      </LegalSection>

      <LegalSection heading="6. Data Retention">
        <p>
          Account data is kept while your voter account is active. Session and refresh tokens are revoked on expiry or logout (refresh tokens expire after 30 days). Activity logs are retained for
          audit purposes.
        </p>
      </LegalSection>

      <LegalSection heading="7. Biometric Data">
        <p>
          Face verification is optional. If used, the descriptor and photo are stored securely and are used solely to verify your identity before voting. You may request removal of your enrolled face
          data at any time by contacting us.
        </p>
      </LegalSection>

      <LegalSection heading="8. Cookies">
        <p>
          We use only essential cookies required for security and session management. These are always active, and we do not set tracking or advertising cookies. Your cookie preference is stored on
          your device. See our <LegalLink to="/cookies">Cookie Policy</LegalLink>.
        </p>
      </LegalSection>

      <LegalSection heading="9. Third Parties">
        <p>
          If enabled, reCAPTCHA (Google) is used on forms to deter abuse and is subject to Google's privacy policy. Email notifications are sent through our mail provider. We do not sell or share your
          personal data with advertisers.
        </p>
      </LegalSection>

      <LegalSection heading="10. Contact">
        <p>
          Questions or requests: <ContactEmail /> or through the <LegalLink to="/contact">Contact page</LegalLink>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
