# Security Policy

## Supported versions

Bunsho has not reached a stable release yet. Security fixes are applied to the
`main` branch and to the most recent tagged release; there are no long-term
support branches. Until `1.0.0`, please track `main` for fixes.

| Version  | Supported |
| -------- | --------- |
| `main`   | ✅        |
| < `1.0`  | ⚠️ latest tag only |

## Reporting a vulnerability

**Please do not open a public issue for security problems.** A public issue
tells everyone about the flaw before there is a fix available.

Report vulnerabilities privately through GitHub:

1. Go to the [Security Advisories page](https://github.com/ivibedathing/bunsho/security/advisories/new).
2. Click **Report a vulnerability**.
3. Describe the issue with as much of the detail below as you have.

This opens a private channel visible only to the maintainers.

Useful things to include:

- The affected version, commit, or deployed URL.
- What an attacker can achieve — read other tenants' documents, bypass
  approval, forge an audit entry, escalate to admin, and so on.
- Steps to reproduce, ideally a minimal proof of concept.
- Any suggested fix, if you have one in mind.

## What to expect

- **Acknowledgement within 3 working days.** If you have not heard back by
  then, assume the report was missed and please ping the advisory thread.
- **An initial assessment within 10 working days**, including whether we accept
  the report and a rough severity.
- **Fix and disclosure**: we aim to ship a fix within 90 days of accepting a
  report. We will coordinate the disclosure date with you and request a CVE for
  anything of moderate severity or above.
- **Credit**: reporters are credited in the advisory and release notes unless
  you would rather stay anonymous.

We will not take legal action against researchers who act in good faith, stay
within the scope below, and give us reasonable time to respond.

## Scope

In scope — the Bunsho application itself:

- Authentication and session handling (`next-auth`).
- Document access control, approval workflow, and the audit trail's integrity.
- Attachment upload and retrieval.
- The export and import paths, including generated repositories.
- Injection of any kind, SSRF, and template-rendering escapes.

Out of scope:

- Findings against a self-hosted deployment's own infrastructure — your reverse
  proxy, TLS configuration, database hardening, or host OS. Bunsho ships a
  reference `docker-compose.yml`, not a hardened production topology.
- Vulnerabilities in dependencies that already have a public advisory and no
  Bunsho-specific exploit path — Dependabot handles those. Please do report it
  if you have found a way to actually reach the vulnerable code through Bunsho.
- Missing security headers or rate limits with no demonstrated impact.
- Anything requiring a pre-existing admin account or physical access to the
  host.

## Deployment note

Bunsho is self-hosted, so the operator owns the deployment's security posture.
Please review `.env.example` before going to production — in particular, set a
strong `AUTH_SECRET`, terminate TLS in front of the app, and keep the Postgres
instance off the public internet.
