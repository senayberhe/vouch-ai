# Limited internal pilot plan

## Recommended first use

Run a small, time-boxed pilot for searching a curated set of non-sensitive internal reference documents. Treat every answer as a research aid: users check the cited passages, and no answer is used by itself to make a decision about a person, money, safety, access, or compliance.

Start with one team, one workspace, a document owner, and a separate reviewer for research reports. Invite only the people needed to try the workflow (for example, 5–10 participants) for two to four weeks. Use fictional or public documents first; add approved internal material only after the data owner and security contact approve the exact document set and retention rules.

## Pilot boundaries

- In scope: upload approved reference documents, ask questions, inspect citations, and try research reports with independent human review.
- Out of scope: public access, customer or student records, HR/health/financial/legal secrets, credentials, automated decisions, external actions, and treating generated content as authoritative.
- Use the offline/extractive answer mode initially (`MODEL_BACKEND=offline`). It avoids outbound model calls and makes answers easier to trace to passages.
- Keep the pilot isolated from production systems and do not connect email, cloud drives, or other document sources.
- Name a pilot owner and a technical operator. Limit document upload to the owner or a small curator group; remove access when a participant leaves.

## Before inviting participants

Do not expose the current Compose setup directly to the internet. The repository's Compose guide binds the API and web ports to loopback, which is suitable for a local demo but does not provide a shared HTTPS deployment. For a network-accessible pilot, choose an organization-approved private hosting environment and complete these checks first:

- Use HTTPS, an organization-managed identity provider, short-lived/revocable access, and an explicit participant allowlist. The app now supports admin-created workspace invitation links; set `CAPSTONE_INVITE_ONLY=1` to block uninvited new accounts. Invitations are bearer links delivered manually, currently work for new password accounts only, and are not a replacement for a managed identity provider or verified email.
- Replace the demo authentication arrangement with a documented pilot access process. Verify authorization for every participant and reviewer, including tenant and group boundaries.
- Use PostgreSQL with versioned schema migrations. The current schema initializer creates tables but does not upgrade existing schemas.
- Put secrets in an approved secret manager; rotate all sample credentials. Restrict database and service network access. Keep optional LLM mode disabled.
- Decide data retention, deletion, backup encryption, restore ownership, and incident contacts before storing approved internal documents. Prove a restore in the pilot environment.
- Review logs, metrics, and error reporting for sensitive content. Set request limits, resource limits, and an operational alert/contact path.
- Confirm the pilot's permitted document types and size limits; avoid parser/file formats that have not been reviewed.
- Record the exact deployment version and configuration. Run the existing security and integration checks in the deployment environment before use; resolve failures before opening access.

## Pilot operating rules

1. The document owner approves each source and its audience before upload.
2. Users verify every answer against the cited source. They report missing, wrong, or exposed information to the pilot owner.
3. A different authorized person reviews research reports. Authors do not approve their own reports.
4. The operator can disable access or stop the service, preserve relevant audit evidence, and contact affected users if an incident occurs.
5. At the end of the pilot, export only approved aggregate feedback, remove pilot data according to the agreed retention schedule, and decide whether to stop, extend, or prepare a broader security review.

## Success and stop conditions

Agree on measures before the first session: whether users can find the right source, how often citations support the answer, how often the system abstains when evidence is missing, time saved, and usability issues. Review outcomes by user group where appropriate, but do not treat a small pilot sample as proof of accuracy or fairness.

Stop the pilot immediately for a suspected cross-workspace disclosure, unauthorized access, unexpected external data transfer, unrecoverable data loss, or a high-impact answer that users might rely on without review. The owner documents the event, disables affected access or functionality, and follows the organization's incident process before restarting.

## Current project limits relevant to this pilot

The project is a demonstration, not a certified or production-ready service. Its own deployment and threat-model documents identify gaps that matter for shared use, including workspace invitations/managed identity, schema migrations, retention and deletion controls, operational telemetry, and production infrastructure/security review. A limited pilot can evaluate usefulness after those deployment basics are addressed; it cannot establish certification or suitability for sensitive/high-impact use.
