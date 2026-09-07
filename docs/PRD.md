# CreoOS Product Requirements Document

## 1. Product Overview

CreoOS is a creator-business operating system for managing a company workspace in one place. The app helps teams plan and track content, tasks, courses, sponsors, affiliates, team operations, and business performance.

The product is designed around a single active company workspace with role-based access and clear separation between read-only and management actions.

## 2. Product Goals

- Provide one workspace for creator business operations.
- Keep operational data easy to browse, update, and export.
- Make team collaboration and review workflows simple.
- Surface business and content performance clearly.
- Support fast navigation between core modules.

## 3. Core User Roles

- Owner: full workspace control.
- Admin: operational control and team management.
- Editor: can create and update operational records where allowed.
- Viewer: read-only access.

## 4. Scope

### 4.1 Workspace Overview

- Show a landing dashboard for the active workspace.
- Summarize content, tasks, sponsor pipeline, and published courses.
- Show workspace health and live status.
- Support CSV export where relevant.

### 4.2 Content

- List content items in a table.
- Support search across key fields.
- Allow create, edit, and delete actions based on role.
- Track stage, progress, channel, and due date.
- Show content pipeline summaries and deadline views.

### 4.3 Tasks

- List tasks by status.
- Support task creation, editing, reassignment, and deletion where permitted.
- Track completion state and task progress.
- Keep task views scoped to the active workspace.

### 4.4 Courses

- List courses for the workspace.
- Show publish status.
- Surface published course counts in analytics.
- Allow course management actions for permitted roles.

### 4.5 Sponsors

- Track sponsor opportunities and revenue pipeline.
- Show sponsor status progression.
- Allow create, edit, and delete actions where permitted.
- Display summarized pipeline value.

### 4.6 Affiliates

- List affiliate records.
- Support search and table browsing.
- Allow management actions based on role permissions.

### 4.7 Team

- Show team members for the active workspace.
- Display name, email, role, title, and bio.
- Allow role updates for owner/admin users.
- Allow member removal for permitted roles.
- Show pending access requests.
- Support approval and rejection of pending requests.
- Protect the owner role from reassignment or removal.

### 4.8 Analytics

- Show workspace performance summaries.
- Display content stage, task status, sponsor pipeline, channel mix, and progress band summaries.
- Show top channels and deadline insights.

### 4.9 Settings

- Allow profile updates such as name, job title, and bio.
- Show account email as read-only.
- Show the current workspace and support switching between available companies.

### 4.10 Notifications

- Show workspace notifications.
- Notify owners and admins when access requests are submitted.
- Surface unread counts or indicators in the workspace shell.

### 4.11 Access Requests

- Allow users to request access to a company workspace.
- Support viewer and editor request types.
- Show pending approval state until reviewed.
- Prevent workspace data access before approval.
- Allow owners/admins to approve or reject requests.

## 5. Functional Requirements

- Users must always see the active workspace context.
- Workspace data must be scoped to the selected company.
- Search must work across the primary list views.
- Export must be available where relevant.
- Role permissions must be enforced consistently across UI and data operations.
- Empty, loading, pending, and unavailable states must be handled clearly.
- The interface must support both read-only and management actions without confusion.

## 6. Data Requirements

- Organizations
- Organization members
- Access requests
- Notifications
- Content items
- Tasks
- Courses
- Sponsors
- Affiliates
- User profile details

## 7. Permission Rules

- Owners and admins can manage access and team roles.
- Editors can manage operational records where allowed.
- Viewers have read-only access.
- Owner role is protected.
- All workspace operations must be scoped to the active company.

## 8. UX Requirements

- Dark, premium workspace shell.
- Dense but readable tables.
- Clear empty states for no workspace, pending access, and no data.
- Fast loading and retry states.
- Simple mobile behavior for primary workflows.

## 9. Non-Functional Requirements

- Fast initial load and responsive navigation.
- Reliable workspace switching.
- Stable data refresh behavior.
- Graceful handling of unavailable backend data.
- Permission checks must be consistent across views and actions.

## 10. Out of Scope

- Authentication and session design.
- Billing and subscriptions.
- Public marketing site.
- External integrations not needed for core workspace operations.
- Advanced automation beyond the core workspace workflows.

