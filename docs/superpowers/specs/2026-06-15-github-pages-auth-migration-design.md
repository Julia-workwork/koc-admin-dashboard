# GitHub Pages Auth Migration Design

## Goal

Move the KOC Admin dashboard from a Render-hosted Node server to a faster GitHub Pages entry point while keeping Google Sheets as the data source. The new version must support account-based login and three roles: Admin, Editor, and Viewer.

Render will remain available during migration so the current dashboard is not interrupted.

## Architecture

The GitHub Pages version uses this flow:

```text
GitHub Pages static dashboard
  -> Google Apps Script API
  -> Google Sheet
```

GitHub Pages serves only static files. It does not store passwords, account data, or private sheet data. Google Apps Script becomes the backend for login, permissions, sheet reads, and controlled sheet writes.

## Authentication

The login screen will use username and password.

Accounts are managed in Google Apps Script backend configuration, not in frontend code. The first version will store active account records in Script Properties. Passwords must not be shipped in the static dashboard.

Login creates a short-lived session token. The preferred session behavior is daily login: a successful login remains valid for the current day, then the user must sign in again.

The dashboard header shows the current account and role, for example:

```text
Julia · Admin
```

It also includes Log out.

## Roles

Admin can:

- View Today, 2025 Users, 2026 Users, Influencers, and Rules.
- Edit KOC and Influencer records.
- Apply parsed update suggestions to Google Sheets.
- Manage rules such as dropdown values and color guidance.
- Manage accounts in a later admin workflow.

Editor can:

- View Today, 2025 Users, 2026 Users, Influencers, and Rules.
- Edit KOC and Influencer records.
- Fill `Update Input - Write Here`.
- Run update analysis.
- Apply allowed record updates to Google Sheets.
- Cannot manage rules or accounts.

Viewer can:

- View Today, 2025 Users, 2026 Users, Influencers, and Rules.
- Search, filter, and open details.
- Cannot edit records.
- Cannot apply suggestions or write to Google Sheets.

Permissions must be enforced by Google Apps Script, not only by hiding frontend buttons.

## Editable Fields

The first version will not allow free editing of the entire sheet. It will only write approved operational fields.

KOC editable fields:

- `Update Input - Write Here`
- `User Level (S/A/B/C/TBD)`
- `ABC Program Potential`
- `Beta Tester Potential`
- `Content Feedback Quality`
- `Cooperation Level`
- `User Status`
- `User Type`
- `Last Contact Date`
- `Next Follow-up Date`
- `Follow-up Reason`
- `Notes`
- `AI Suggestion Status`

Influencer editable fields:

- `Update Input - Write Here`
- `Level`
- `Status`
- `Product`
- `Next Action`
- `Latest Note / Notes`
- `Last Contact Date`
- `Next Follow-up Date`

Fields that should stay read-only in the first version:

- Name
- Email
- Profile
- Country or region
- Address
- Resources and links
- Original imported fields
- Sheet headers and sheet structure

## Pages

Login page:

- Username input.
- Password input.
- Login error messages.

Today:

- All roles can view follow-up buckets.
- Editor and Admin can open a user and update allowed fields.
- Viewer can only inspect details.

2025 Users and 2026 Users:

- All roles can search, filter, and view details.
- Editor and Admin see editing controls in the detail panel.
- Viewer sees read-only fields only.

Influencers:

- All roles can view the influencer list and details.
- Editor and Admin can update allowed collaboration fields.
- Viewer is read-only.

Rules:

- Viewer and Editor can read rule explanations.
- Admin can later manage dropdown values, color guidance, and account settings.
- First implementation may keep rule management read-only and focus on account permissions plus record write-back.

## Data Flow

Login:

```text
Frontend submits username and password
  -> Apps Script validates account
  -> Apps Script returns token, role, and display name
  -> Frontend stores token for the current session/day
```

Read data:

```text
Frontend requests users with token
  -> Apps Script validates token
  -> Apps Script reads 2025 KOC, 2026 KOC, and Influencers
  -> Frontend renders dashboard
```

Write data:

```text
Frontend submits allowed field updates with token
  -> Apps Script validates token and role
  -> Apps Script checks requested fields are allowed
  -> Apps Script writes to Google Sheet
  -> Apps Script returns updated row summary
```

## Audit Trail

Every write should record:

- Account username.
- Role.
- Timestamp.
- Sheet name.
- Row identifier.
- Fields changed.

The first version can record this in an Apps Script log sheet or a dedicated audit tab. The exact storage can be chosen during implementation, but write actions should be traceable.

## Error Handling

Frontend should show clear messages for:

- Invalid username or password.
- Expired session.
- Viewer attempting to edit.
- Editor attempting to edit rules or accounts.
- Apps Script unavailable.
- Google Sheet write failure.

The dashboard should not pretend a write succeeded unless Apps Script confirms it.

## Testing

Implementation should verify:

- Admin can read and write allowed fields.
- Editor can read and write allowed record fields.
- Editor cannot manage rules or accounts.
- Viewer can read but cannot write.
- Expired or invalid tokens cannot read or write.
- Only approved fields can be written.
- Existing parsing tests continue to pass.

## Rollout

1. Keep the current Render deployment active.
2. Add GitHub Pages-compatible static mode.
3. Extend Google Apps Script for login, roles, reads, and writes.
4. Test Admin, Editor, and Viewer accounts.
5. Publish the GitHub Pages beta URL.
6. Use GitHub Pages as the main link after validation.
7. Keep or retire Render after the GitHub Pages version is stable.

## Non-Goals For First Version

- Full CRM system.
- Independent database.
- Public signup.
- User self-service password reset.
- Free editing of all Google Sheet columns.
- Complex field-level permission customization.
