export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export const workspaceRoles: WorkspaceRole[] = ["owner", "admin", "editor", "viewer"];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return workspaceRoles.includes(value as WorkspaceRole);
}

export function canManageRecords(role: string | null | undefined) {
  return role === "owner" || role === "admin" || role === "editor";
}

export function canManageAccess(role: string | null | undefined) {
  return role === "owner" || role === "admin";
}

export function canViewManagementModules(role: string | null | undefined) {
  return canManageAccess(role);
}

export function canAssignRole(actorRole: string | null | undefined, targetRole: string, nextRole: string) {
  if (!canManageAccess(actorRole) || !isWorkspaceRole(targetRole) || !isWorkspaceRole(nextRole)) return false;
  if (targetRole === "owner" || nextRole === "owner") return actorRole === "owner" && targetRole === "owner" && nextRole === "owner";
  return true;
}

export const rolePermissions = [
  { role: "Owner", summary: "Full workspace control", detail: "Manage all records, members, roles, access requests, and workspace settings." },
  { role: "Admin", summary: "Operations and access", detail: "Manage all records and team access, but cannot change or remove the workspace owner." },
  { role: "Editor", summary: "Content and operations", detail: "Create, edit, and delete content, tasks, courses, sponsors, and affiliates. Team access is view-only." },
  { role: "Viewer", summary: "Read-only access", detail: "View workspace data and export available lists. Cannot create, edit, delete, or manage members." },
] as const;
