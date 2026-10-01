import { LegalShell, LegalSection, LegalList, ContactEmail } from './LegalShell';

export default function Terms() {
  return (
    <LegalShell icon="fa-file-signature" title="Terms of Service & Copyright" subtitle="E-Voting System — OGITECH Student Elections" updated="September 2026">
      <LegalSection heading="1. Acceptance of Terms">
        <p>By accessing or using the E-Voting System, you agree to these Terms. If you do not agree, do not use the platform.</p>
      </LegalSection>

      <LegalSection heading="2. Eligibility">
        <p>
          You must be a registered student of OGITECH, provide accurate details (including a valid email and matric number) and verify your email to participate. Each voter is entitled to one ballot
          per contested position per election.
        </p>
      </LegalSection>

      <LegalSection heading="3. Acceptable Use">
        <p>You agree not to:</p>
        <LegalList
          items={[
            'Attempt to cast more than one ballot per position or per election.',
            'Misrepresent your identity, impersonate another voter, or share your access credentials.',
            'Attempt to bypass accreditation, geolocation, face verification or other security controls.',
            'Interfere with other voters or with the voting infrastructure.',
            'Use the platform for any unlawful purpose.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Voting Integrity">
        <p>Voting is final once submitted; ballots cannot be altered or withdrawn after submission. Election results are produced by automated tabulation and are final once published.</p>
      </LegalSection>

      <LegalSection heading="5. Copyright & Intellectual Property">
        <p>
          All content, design, code, branding, graphics and documentation of the E-Voting System are the intellectual property of OGITECH and its developers and are protected by applicable copyright
          and intellectual property laws. You may not copy, reproduce, distribute, modify or create derivative works without prior written permission. Text and images supplied by candidates are used
          at the candidates' own responsibility.
        </p>
      </LegalSection>

      <LegalSection heading="6. Disclaimers">
        <p>
          The platform is provided "as is" and "as available" without warranties of any kind, express or implied. While we work to keep the service secure and available, we do not guarantee
          uninterrupted or error-free operation.
        </p>
      </LegalSection>

      <LegalSection heading="7. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, OGITECH and its administrators shall not be liable for indirect, incidental or consequential damages arising from use of, or inability to use, the
          service.
        </p>
      </LegalSection>

      <LegalSection heading="8. Changes">
        <p>We may update these terms from time to time; updated versions take effect when published on this page.</p>
      </LegalSection>

      <LegalSection heading="9. Governing Law">
        <p>These terms are governed by the laws of the Federal Republic of Nigeria. Disputes shall be subject to the jurisdiction of Nigerian courts.</p>
      </LegalSection>

      <LegalSection heading="10. Contact">
        <p>
          For permissions or questions: <ContactEmail />.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
