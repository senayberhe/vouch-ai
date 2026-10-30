# Workspace invitations

Workspace admins can create invitations from **Workspace** in the web app. Invitations are bound to a normalized email address, grant only `reader`, `editor`, or `reviewer`, expire after seven days, and are accepted once. A new account joining through an invitation is linked to the admin's workspace and receives the `personal` access group. Invitations cannot grant admin privileges. The token is carried in the URL fragment and removed from browser history after the page reads it; fragments are not sent in the HTTP request path.

The service does not send email. The admin receives a one-time invitation URL and must deliver it to the intended person through an organization-approved private channel. The URL is a bearer secret: anyone who obtains it can attempt to create the invited account, so do not post it in chat channels or tickets visible to a broad audience. The account must use the exact invited email. This is not email verification or a substitute for an organization identity provider.

To restrict new account creation to invited people, set:

```dotenv
CAPSTONE_INVITE_ONLY=1
```

This setting blocks uninvited password signups and Google signups for new accounts. Existing Google accounts can still sign in. Invitation acceptance currently uses an email and password account; Google sign-in cannot consume an invitation. Accepting an invitation does not prove ownership of the email, so if the same address later signs in with Google, that account leaves the invited workspace and moves to its own private workspace. Invited people should keep using their password; moving back needs a new account because invitations cover new accounts only. Existing accounts cannot be moved into a second workspace, and users currently belong to one workspace at a time. For an internal pilot, use a new account for each invited participant and verify access is removed through the session/user process when someone leaves; membership removal and account lifecycle administration are not yet provided by the UI.

The schema initializer creates the membership and invitation tables for a new database. It does not upgrade existing schemas; persistent deployments must use a reviewed, versioned migration before enabling this feature. Do not expose invitations on an internet-facing deployment without an approved identity, email delivery, audit, and account recovery process.
