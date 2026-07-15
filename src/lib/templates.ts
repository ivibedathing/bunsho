import { prisma } from "@/lib/db";
import { createDocument, nextDocCode, saveDraft } from "@/lib/documents";
import { markdownToProseMirror } from "@/lib/markdown/parse";

/**
 * Starter template pack (DECISIONS.md): a small set of SOC 2-oriented policies and
 * procedures, original content licensed CC BY 4.0. Offered on first run so a
 * fresh instance isn't an empty screen. Seeded as Drafts for the org to adapt.
 */

export interface StarterTemplate {
  title: string;
  body: string;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    title: "Information Security Policy",
    body: `# Information Security Policy

## Purpose
This policy sets the organization's commitment to protecting the confidentiality, integrity, and availability of information assets, and the responsibilities everyone shares for doing so.

## Scope
Applies to all employees, contractors, and systems that store, process, or transmit organizational or customer data.

## Policy
- Information is protected in proportion to its sensitivity and business value.
- Security responsibilities are assigned and reviewed at least annually.
- Access follows least privilege; changes are logged and reviewed.
- Security incidents are reported promptly and handled per the Incident Response Procedure.

## Review
This policy is reviewed at least annually and after any material change to the business or its systems.`,
  },
  {
    title: "Access Control Policy",
    body: `# Access Control Policy

## Purpose
Define how access to systems and data is granted, reviewed, and revoked.

## Policy
- Access is granted on a least-privilege, need-to-know basis and approved by the resource owner.
- Multi-factor authentication is required for all remote and administrative access.
- Access is reviewed at least quarterly (see the Access Review Procedure).
- Access is revoked on the same business day a person changes role or leaves.

## Records
Approvals, reviews, and revocations are retained as evidence.`,
  },
  {
    title: "Acceptable Use Policy",
    body: `# Acceptable Use Policy

## Purpose
Set expectations for the responsible use of company systems and data.

## Policy
- Company systems are used for legitimate business purposes.
- Credentials are never shared; devices are locked when unattended.
- Confidential data is not stored on unmanaged devices or personal accounts.
- Suspected misuse or compromise is reported immediately.`,
  },
  {
    title: "Data Classification and Handling Policy",
    body: `# Data Classification and Handling Policy

## Purpose
Provide a consistent scheme for classifying data and handling it accordingly.

## Classifications
- **Public** — approved for release.
- **Internal** — default for business data.
- **Confidential** — sensitive business or customer data.
- **Restricted** — data whose exposure would cause serious harm.

## Handling
Encryption in transit is required for all classifications; encryption at rest is required for Confidential and Restricted data. Retention and disposal follow the data owner's direction.`,
  },
  {
    title: "Vendor and Third-Party Risk Policy",
    body: `# Vendor and Third-Party Risk Policy

## Purpose
Ensure third parties handling company or customer data meet our security expectations.

## Policy
- Vendors with access to sensitive data are risk-assessed before onboarding.
- Security and privacy obligations are captured in contracts.
- Vendor risk is reviewed at least annually and on material change.`,
  },
  {
    title: "Vulnerability and Patch Management Policy",
    body: `# Vulnerability and Patch Management Policy

## Purpose
Reduce risk from known vulnerabilities through timely detection and remediation.

## Policy
- Systems are scanned for vulnerabilities on a regular cadence.
- Remediation targets are set by severity, with critical issues prioritized.
- Exceptions are documented, time-bound, and approved.`,
  },
  {
    title: "Incident Response Procedure",
    body: `# Incident Response Procedure

## Purpose
Provide clear, repeatable steps for handling security incidents.

## Steps
1. **Detect & report** — anyone who suspects an incident reports it to the security contact.
2. **Triage** — assess scope, severity, and affected data.
3. **Contain** — limit impact and preserve evidence.
4. **Eradicate & recover** — remove the cause and restore normal operation.
5. **Review** — capture lessons learned and update controls.

## Records
Each incident is logged with a timeline, actions taken, and follow-ups.`,
  },
  {
    title: "Access Review Procedure",
    body: `# Access Review Procedure

## Purpose
Verify that access remains appropriate over time.

## Steps
1. Generate the current access list per system.
2. Resource owners confirm each grant is still needed.
3. Remove or adjust access that is no longer appropriate.
4. Record the review, decisions, and any changes as evidence.

## Cadence
Reviews are performed at least quarterly.`,
  },
];

/**
 * Seed any templates not already present, as Drafts owned by the acting admin.
 * Idempotent — safe to run more than once.
 *
 * Identity is the title, not the doc code: templates draw their codes from the
 * same `DOC-` sequence as everything else, so a hardcoded code would collide
 * with whatever the org has already created and silently skip the template.
 * Codes are allocated one at a time, inside the loop, so each seeded draft
 * advances the sequence for the next.
 */
export async function seedStarterTemplates(orgId: string, actorId: string): Promise<number> {
  let created = 0;
  for (const tpl of STARTER_TEMPLATES) {
    const exists = await prisma.document.findFirst({
      where: { orgId, title: tpl.title },
      select: { id: true },
    });
    if (exists) continue;
    const doc = await createDocument(orgId, actorId, {
      title: tpl.title,
      docCode: await nextDocCode(orgId),
    });
    await saveDraft(orgId, doc.id, markdownToProseMirror(tpl.body));
    created++;
  }
  return created;
}
