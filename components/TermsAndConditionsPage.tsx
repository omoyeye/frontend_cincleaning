import React, { useState } from 'react';
import { useBusinessSettings } from '../src/context/BusinessSettingsContext';

type TabKey = 'terms' | 'privacy' | 'cookies';

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 border-b border-slate-100 pb-10 last:border-0 last:pb-0">
      <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{title}</h2>
      <div className="mt-4 space-y-3 text-slate-600 text-sm sm:text-base leading-relaxed">{children}</div>
    </section>
  );
}

const TermsAndConditionsPage: React.FC<{ onBookNow: () => void }> = ({ onBookNow }) => {
  const brand = useBusinessSettings();
  const company = (brand.companyName ?? '').trim() || 'CiN Cleaning';
  const brandEmail = (brand.email ?? '').trim() || 'info@cincleaning.co.uk';
  const [tab, setTab] = useState<TabKey>('terms');
  const depositPct = Number.isFinite(Number(brand.depositPolicy?.requiredPercent))
    ? Math.min(100, Math.max(0, Number(brand.depositPolicy?.requiredPercent)))
    : 40;
  const depositMsg =
    typeof brand.depositPolicy?.message === 'string' && brand.depositPolicy.message.trim()
      ? brand.depositPolicy.message.trim()
      : '';
  const noticeHours = Number.isFinite(Number(brand.cancellationPolicy?.shortNoticeWindowHours))
    ? Math.max(1, Number(brand.cancellationPolicy?.shortNoticeWindowHours))
    : 24;
  const noticeFeePct = Number.isFinite(Number(brand.cancellationPolicy?.shortNoticeFeePercent))
    ? Math.min(100, Math.max(0, Number(brand.cancellationPolicy?.shortNoticeFeePercent)))
    : 10;
  const consentMsg =
    typeof brand.cancellationPolicy?.consentMessage === 'string' && brand.cancellationPolicy.consentMessage.trim()
      ? brand.cancellationPolicy.consentMessage.trim()
      : '';

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'terms', label: 'Terms & Conditions' },
    { key: 'privacy', label: 'Privacy Policy' },
    { key: 'cookies', label: 'Cookie Policy' },
  ];

  return (
    <div className="bg-slate-50/80">
      <section className="py-10 md:py-14 max-w-3xl mx-auto px-4 lg:px-8">
        <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-50 text-teal-700">
          Legal
        </span>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight mt-4">
          {tab === 'terms' && 'Terms & Conditions'}
          {tab === 'privacy' && 'Privacy Policy'}
          {tab === 'cookies' && 'Cookie Policy'}
        </h1>
        <div className="flex flex-wrap gap-2 mt-6" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                tab === t.key
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <article className="max-w-3xl mx-auto px-4 lg:px-8 pb-16 md:pb-20 space-y-10">
        <div className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-8 md:p-10 shadow-sm space-y-10">

          {tab === 'terms' && (
            <>
              <Section id="agreement" title="1. Agreement">
                <p>
                  By submitting a booking on our website or app, you agree to these terms together with any service description,
                  price, and date shown at checkout. If something in your confirmation email differs, the confirmation reflects
                  what we agreed for that job.
                </p>
              </Section>

              <Section id="company-info" title="2. Company Information">
                <p>
                  {company} is a trading name of Surpluslink &amp; Co LTD, a company registered in England &amp; Wales.
                  Registered office address: as displayed on our website footer. Contact: {brandEmail}.
                </p>
              </Section>

              <Section id="how-to-book" title="3. How to Book">
                <ol className="list-decimal pl-5 space-y-2">
                  <li>Choose your service type (for example regular, deep, end of tenancy, or commercial).</li>
                  <li>Enter accurate property or site details, size, and any extras so we can quote time and price fairly.</li>
                  <li>Pick a date and arrival window that work for you, and provide a contact email and phone we can reach on the day.</li>
                  <li>Review the total, deposit amount, and cancellation / short-notice wording shown before you confirm.</li>
                  <li>Accept deposit and payment terms where prompted, then submit the booking.</li>
                  <li>
                    Pay the <strong className="text-slate-800">deposit ({depositPct}% of the booking total)</strong> by bank transfer
                    using the details in your confirmation email (or as instructed by our team).
                  </li>
                  <li>After we acknowledge payment, you will receive a booking reference.</li>
                  <li>Before the visit, ensure safe access, parking if needed, and that the scope still matches what you booked.</li>
                </ol>
                <div className="mt-6 rounded-xl bg-teal-50 border border-teal-100 px-4 py-3 text-sm text-teal-900">
                  <p className="font-bold">Ready to start?</p>
                  <button
                    type="button"
                    onClick={onBookNow}
                    className="mt-2 text-sm font-black text-teal-800 underline underline-offset-2 hover:text-teal-950"
                  >
                    Go to the booking form
                  </button>
                </div>
              </Section>

              <Section id="deposit" title="4. Deposits">
                <p>
                  A deposit secures your date in our rota, reserves the right team size for your hours, and covers planning and
                  scheduling cost before we travel.
                </p>
                <p>
                  <strong className="text-slate-800">When to pay:</strong> pay the deposit as soon as possible after booking, and in
                  any case before attendance on the day, unless we have confirmed a different arrangement.
                </p>
                {depositMsg ? (
                  <blockquote className="border-l-4 border-teal-500 pl-4 py-1 text-slate-700 italic">{`"${depositMsg}"`}</blockquote>
                ) : null}
              </Section>

              <Section id="payment" title="5. Payment">
                <ul className="list-disc pl-5 space-y-2">
                  <li>Prices quoted at booking are based on the information you provide. Material changes may change the final price with your agreement.</li>
                  <li>Bank transfer is our standard method for deposits; other methods may appear on your invoice when offered.</li>
                  <li>Late payment may delay future bookings or incur charges set out on your invoice.</li>
                </ul>
              </Section>

              <Section id="consumer-rights" title="6. Consumer Rights & Cooling-Off Period">
                <p>
                  Under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 and the Consumer
                  Rights Act 2015, you may have a right to cancel within 14 days of entering into this contract (the "cooling-off period"),
                  unless you have requested that the service begins within that period.
                </p>
                <p>
                  If you have expressly requested that service begins before the cooling-off period ends, you acknowledge that you will
                  lose your right to cancel once the service has been fully performed, and you may be liable for payment proportionate
                  to the service provided up to the point of cancellation.
                </p>
              </Section>

              <Section id="cancellation" title="7. Cancellations and Rescheduling">
                <p>
                  <strong className="text-slate-800">Outside short notice:</strong> you may request to cancel or reschedule through
                  your client portal or by contacting us.
                </p>
                <p>
                  <strong className="text-slate-800">Short-notice window:</strong> if you cancel within{' '}
                  <strong className="text-slate-800">{noticeHours}</strong> {noticeHours === 1 ? 'hour' : 'hours'} of the scheduled
                  start, a <strong className="text-slate-800">short-notice fee of up to {noticeFeePct}%</strong> of the booking total
                  may apply.
                </p>
                {consentMsg ? (
                  <p className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-slate-800 text-sm">{consentMsg}</p>
                ) : null}
              </Section>

              <Section id="your-responsibilities" title="8. Your Responsibilities">
                <ul className="list-disc pl-5 space-y-2">
                  <li>Safe and legal access at the agreed time.</li>
                  <li>Accurate contact details and address; tell us about parking, codes, pets, or hazards before we arrive.</li>
                  <li>Valuables and sensitive items stored away.</li>
                  <li>Reasonable working conditions (running water, electricity, reasonable room temperature).</li>
                </ul>
              </Section>

              <Section id="liability" title="9. Limitation of Liability">
                <p>
                  We maintain appropriate public liability insurance. Our liability for any single claim is limited to the total price
                  paid for the specific booking in question. Nothing in these terms limits our liability for death or personal injury caused
                  by our negligence, fraud, or any other liability that cannot be excluded by law.
                </p>
              </Section>

              <Section id="complaints" title="10. Problems and Complaints">
                <p>
                  If you are unhappy with any aspect of the visit, contact us within 48 hours of completion with photos if relevant.
                  We will investigate and propose a fair remedy where the issue is within our control.
                </p>
              </Section>

              <Section id="dispute-resolution" title="11. Dispute Resolution">
                <p>
                  If we cannot resolve a complaint to your satisfaction, you may refer the matter to an Alternative Dispute Resolution (ADR)
                  provider. Details of approved ADR providers can be found at{' '}
                  <a href="https://www.citizensadvice.org.uk" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2">
                    Citizens Advice
                  </a>
                  . You also have the right to use the{' '}
                  <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2">
                    EU Online Dispute Resolution platform
                  </a>
                  .
                </p>
              </Section>

              <Section id="law" title="12. Governing Law">
                <p>
                  These terms are governed by the laws of England and Wales. Nothing here limits your statutory rights as a consumer.
                  If any part of these terms is unenforceable, the rest still applies.
                </p>
                <p className="text-xs text-slate-500 pt-2">
                  Last updated: September 2026. {company}, a trading name of Surpluslink &amp; Co LTD.
                </p>
              </Section>
            </>
          )}

          {tab === 'privacy' && (
            <>
              <Section id="privacy-controller" title="1. Data Controller">
                <p>
                  The data controller is {company} (a trading name of Surpluslink &amp; Co LTD), registered in England &amp; Wales.
                  For data protection queries, contact our Data Protection Officer at: {brandEmail}.
                </p>
              </Section>

              <Section id="privacy-data-collected" title="2. Data We Collect">
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong className="text-slate-800">Identity data:</strong> name, email address, phone number.</li>
                  <li><strong className="text-slate-800">Address data:</strong> property address for service delivery.</li>
                  <li><strong className="text-slate-800">Financial data:</strong> payment references (we do not store full card numbers; card payments are processed by Stripe, a PCI DSS Level 1 certified provider).</li>
                  <li><strong className="text-slate-800">Booking data:</strong> service type, dates, times, special instructions, photos.</li>
                  <li><strong className="text-slate-800">Communication data:</strong> in-app messages, chat history, email correspondence.</li>
                  <li><strong className="text-slate-800">Technical data:</strong> IP address, browser type, device information, cookies.</li>
                  <li><strong className="text-slate-800">Staff data:</strong> bank details (for payroll), availability, clock-in/out records, location during jobs.</li>
                </ul>
              </Section>

              <Section id="privacy-lawful-basis" title="3. Lawful Basis for Processing">
                <p>We process your personal data on the following lawful bases under UK GDPR Article 6:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong className="text-slate-800">Contract (Art. 6(1)(b)):</strong> processing necessary to fulfil your booking and deliver cleaning services.</li>
                  <li><strong className="text-slate-800">Legitimate interest (Art. 6(1)(f)):</strong> improving our services, preventing fraud, internal analytics.</li>
                  <li><strong className="text-slate-800">Legal obligation (Art. 6(1)(c)):</strong> tax records, regulatory compliance, health and safety.</li>
                  <li><strong className="text-slate-800">Consent (Art. 6(1)(a)):</strong> marketing emails and promotional communications. You can withdraw consent at any time.</li>
                </ul>
              </Section>

              <Section id="privacy-sharing" title="4. Who We Share Data With">
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong className="text-slate-800">Cleaning staff:</strong> address and access instructions needed to perform the service.</li>
                  <li><strong className="text-slate-800">Payment processors:</strong> Stripe (PCI DSS Level 1 certified) for card payments.</li>
                  <li><strong className="text-slate-800">Email service:</strong> Brevo (Sendinblue) for transactional and marketing emails.</li>
                  <li><strong className="text-slate-800">Hosting:</strong> our servers are hosted within the UK/EEA.</li>
                  <li><strong className="text-slate-800">Legal obligations:</strong> law enforcement or regulatory authorities when required by law.</li>
                </ul>
                <p>We do not sell your personal data to third parties.</p>
              </Section>

              <Section id="privacy-international" title="5. International Data Transfers">
                <p>
                  Where data is processed outside the UK/EEA (for example, by Stripe in the US), we ensure appropriate safeguards
                  are in place, including Standard Contractual Clauses (SCCs) approved by the ICO, or the provider's participation in
                  recognised adequacy frameworks.
                </p>
              </Section>

              <Section id="privacy-retention" title="6. Data Retention">
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong className="text-slate-800">Account data:</strong> retained while your account is active and for 12 months after deletion request.</li>
                  <li><strong className="text-slate-800">Booking records:</strong> 6 years after completion (HMRC requirement).</li>
                  <li><strong className="text-slate-800">Financial records:</strong> 6 years (Companies Act 2006 / HMRC).</li>
                  <li><strong className="text-slate-800">Marketing consent records:</strong> retained for the duration of consent plus 12 months.</li>
                  <li><strong className="text-slate-800">Chat messages:</strong> 2 years after the related booking is completed.</li>
                  <li><strong className="text-slate-800">Technical logs:</strong> 90 days.</li>
                </ul>
              </Section>

              <Section id="privacy-rights" title="7. Your Rights Under UK GDPR">
                <p>You have the following rights regarding your personal data:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong className="text-slate-800">Right of access (Art. 15):</strong> request a copy of all personal data we hold about you (Subject Access Request).</li>
                  <li><strong className="text-slate-800">Right to rectification (Art. 16):</strong> request correction of inaccurate data.</li>
                  <li><strong className="text-slate-800">Right to erasure (Art. 17):</strong> request deletion of your personal data, subject to legal retention requirements.</li>
                  <li><strong className="text-slate-800">Right to restrict processing (Art. 18):</strong> request we limit how we use your data.</li>
                  <li><strong className="text-slate-800">Right to data portability (Art. 20):</strong> receive your data in a machine-readable format.</li>
                  <li><strong className="text-slate-800">Right to object (Art. 21):</strong> object to processing based on legitimate interest or for direct marketing.</li>
                  <li><strong className="text-slate-800">Right to withdraw consent:</strong> withdraw consent for marketing at any time without affecting the lawfulness of prior processing.</li>
                </ul>
                <p>
                  To exercise any of these rights, contact us at {brandEmail}. We will respond within one month as required by UK GDPR.
                </p>
              </Section>

              <Section id="privacy-children" title="8. Children's Data">
                <p>
                  Our services are not directed at children under 18. We do not knowingly collect personal data from anyone under 18.
                  If you believe we have collected data from a child, please contact us immediately at {brandEmail}.
                </p>
              </Section>

              <Section id="privacy-automated" title="9. Automated Decision-Making">
                <p>
                  We do not use automated decision-making or profiling that produces legal or similarly significant effects on you.
                  Pricing is based on the service type, property details, and any extras you select.
                </p>
              </Section>

              <Section id="privacy-complaints" title="10. Complaints">
                <p>
                  If you are unhappy with how we handle your data, you have the right to lodge a complaint with the Information
                  Commissioner's Office (ICO):
                </p>
                <ul className="list-none space-y-1 mt-2 text-sm">
                  <li>Website: <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2">ico.org.uk/make-a-complaint</a></li>
                  <li>Phone: 0303 123 1113</li>
                  <li>Address: Information Commissioner's Office, Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF</li>
                </ul>
              </Section>

              <Section id="privacy-updates" title="11. Changes to This Policy">
                <p>
                  We may update this privacy policy from time to time. Material changes will be notified via email or a notice on our website.
                  The date of the last update is shown at the bottom of this page.
                </p>
                <p className="text-xs text-slate-500 pt-2">Last updated: September 2026 (v2.0).</p>
              </Section>
            </>
          )}

          {tab === 'cookies' && (
            <>
              <Section id="cookie-what" title="1. What Are Cookies?">
                <p>
                  Cookies are small text files placed on your device by websites you visit. They are widely used to make websites
                  work efficiently and to provide information to site owners. We use cookies in accordance with the Privacy and
                  Electronic Communications Regulations 2003 (PECR) and UK GDPR.
                </p>
              </Section>

              <Section id="cookie-essential" title="2. Essential Cookies">
                <p>These cookies are necessary for the website to function and cannot be switched off. They include:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong className="text-slate-800">Session cookie:</strong> keeps you logged in during your visit.</li>
                  <li><strong className="text-slate-800">CSRF token:</strong> protects against cross-site request forgery.</li>
                  <li><strong className="text-slate-800">Cookie consent preference:</strong> remembers your cookie choices.</li>
                  <li><strong className="text-slate-800">Load balancer cookie:</strong> ensures consistent server routing.</li>
                </ul>
              </Section>

              <Section id="cookie-analytics" title="3. Analytics Cookies (Optional)">
                <p>
                  With your consent, we use analytics cookies to understand how visitors interact with the website. These help us
                  improve the user experience. Analytics cookies collect anonymised data about page views and navigation patterns.
                </p>
              </Section>

              <Section id="cookie-marketing" title="4. Marketing Cookies (Optional)">
                <p>
                  With your consent, marketing cookies may be used to deliver relevant advertisements and measure campaign effectiveness.
                  These cookies may be set by third-party advertising partners.
                </p>
              </Section>

              <Section id="cookie-third-party" title="5. Third-Party Cookies">
                <p>Some third-party services we use may set their own cookies:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong className="text-slate-800">Stripe:</strong> for secure payment processing (strictly necessary).</li>
                  <li><strong className="text-slate-800">Google Maps:</strong> if used on the booking form for address lookup.</li>
                </ul>
                <p>
                  Each third-party provider has its own cookie and privacy policy. We recommend reviewing their policies for full details.
                </p>
              </Section>

              <Section id="cookie-manage" title="6. Managing Your Cookie Preferences">
                <p>
                  You can change your cookie preferences at any time using the cookie banner on our website. You can also control
                  cookies through your browser settings:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Chrome: Settings &gt; Privacy and Security &gt; Cookies</li>
                  <li>Firefox: Settings &gt; Privacy &amp; Security &gt; Cookies and Site Data</li>
                  <li>Safari: Preferences &gt; Privacy &gt; Manage Website Data</li>
                  <li>Edge: Settings &gt; Cookies and Site Permissions</li>
                </ul>
                <p>
                  Note that blocking essential cookies may prevent parts of the website from functioning correctly.
                </p>
              </Section>

              <Section id="cookie-mobile" title="7. Mobile App">
                <p>
                  Our mobile app uses local device storage for session tokens and preferences. The app does not use third-party
                  tracking cookies. Push notification preferences can be managed in your device settings and within the app's
                  notification settings screen.
                </p>
              </Section>

              <Section id="cookie-updates" title="8. Updates to This Policy">
                <p>
                  We may update this cookie policy to reflect changes in technology or regulation. Check this page periodically
                  for the latest information.
                </p>
                <p className="text-xs text-slate-500 pt-2">Last updated: September 2026 (v2.0).</p>
              </Section>
            </>
          )}

        </div>
      </article>
    </div>
  );
};

export default TermsAndConditionsPage;
