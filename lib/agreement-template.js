/**
 * Creator agreement template for kāre.
 *
 * This is the contract creators sign in the Command Center's built-in e-sign
 * flow (no PandaDoc/DocuSign needed). A typed signature + timestamp is legally
 * binding under the US ESIGN Act for this kind of agreement.
 *
 * EDIT THE WORDING HERE freely — placeholders in {braces} are filled per creator.
 * Have a lawyer review before relying on it for high-value deals.
 */

export function buildAgreement({ creatorName, creatorHandle, effectiveDate, discountCode, referralLink }) {
  const date = effectiveDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  return `KĀRE CREATOR AGREEMENT

Between: kāre ("Brand"), www.takingkare.com
And: ${creatorName || '[Creator Name]'} ("Creator")${creatorHandle ? ` (${creatorHandle})` : ''}

Effective date: ${date}

1. THE WORK
Creator will create original video content featuring kāre products, following the
brief provided by Brand (talking points, do's and don'ts, hashtags). Content must
be Creator's own honest experience — no scripts read verbatim, no claims Brand
has not approved.

2. POSTING & TIMELINE
Creator will post the agreed content by the deadline in the brief and keep it
live for at least 90 days. If a post underperforms for reasons outside Creator's
control, both sides will discuss a repost in good faith.

3. WHITELISTED ADS
Creator grants Brand permission to run the content as whitelisted ads from
Creator's social accounts (including Meta/Facebook/Instagram) for up to 12 months
from the posting date. Brand will handle all ad spend. Creator will complete the
platform's ad-permissions steps promptly when asked.

4. CONTENT RIGHTS
Creator grants Brand a worldwide, royalty-free license to use, edit, and
republish the content across Brand's marketing channels (ads, website, email,
social) for 12 months from the posting date. Creator keeps ownership of the
original content.

5. PAYMENT
${discountCode ? `Creator receives a ${discountCode} discount code` : 'Creator receives a personal discount code'} and referral link${referralLink ? ` (${referralLink})` : ''}.
Commission: 10% on new-customer sales and 10% on subscription renewals attributed
to Creator's code/link, paid monthly via the affiliate platform. Free product is
provided for content creation and is not payment.

6. DISCLOSURE
Creator will clearly disclose the relationship in every post as required by the
FTC (e.g. #ad, or platform branded-content tools).

7. EXCLUSIVITY
For 30 days after posting, Creator will not promote directly competing colostrum
or "gut health powder" brands.

8. TERMINATION
Either side may end this agreement with 7 days' written notice. Content already
posted stays live per section 2; ad rights already exercised remain valid.

9. GENERAL
This is an independent-contractor relationship, not employment. This agreement is
the entire understanding between the sides about this work.

AGREED:

Creator: ${creatorName || '[Creator Name]'}            Date: ${date}

Brand: kāre                                            Date: ${date}`
}

export const AGREEMENT_VERSION = '2026-10-14-v1'
