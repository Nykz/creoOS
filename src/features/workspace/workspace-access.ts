"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getBrowserAccessToken, insforge } from "@/lib/insforge/browser";

const STORAGE_KEY = "creoos.active-organization";
const SESSION_STORAGE_KEY = "creoos.workspace-session";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours persistent cache
let workspaceRefreshPromise: Promise<WorkspaceAccessState> | null = null;
let cachedWorkspaceAccess: { state: WorkspaceAccessState; at: number } | null = null;

export type WorkspaceUser = {
  id: string;
  email: string | null;
  name: string;
};

export type WorkspaceOrganization = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export type WorkspaceRequest = {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  requested_role: string;
  status: string;
  review_notes: string | null;
  reviewed_at: string | null;
};

export type WorkspaceAccessState =
  | {
      kind: "loading";
      user: null;
      organizations: [];
      activeOrganization: null;
      pendingRequest: null;
      canManageAccess: false;
      error: null;
    }
  | {
      kind: "signed_out";
      user: null;
      organizations: [];
      activeOrganization: null;
      pendingRequest: null;
      canManageAccess: false;
    }
  | {
      kind: "pending";
      user: WorkspaceUser;
      organizations: [];
      activeOrganization: {
        id: string;
        name: string;
        slug: string;
        role: string;
      };
      pendingRequest: WorkspaceRequest;
      canManageAccess: false;
    }
  | {
      kind: "ready";
      user: WorkspaceUser;
      organizations: WorkspaceOrganization[];
      activeOrganization: WorkspaceOrganization;
      pendingRequest: WorkspaceRequest | null;
      canManageAccess: boolean;
      error?: null;
    }
  | {
      kind: "error";
      user: WorkspaceUser | null;
      organizations: WorkspaceOrganization[];
      activeOrganization: WorkspaceOrganization | null;
      pendingRequest: WorkspaceRequest | null;
      canManageAccess: false;
      error: string;
    };

function getStoredOrganizationId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setStoredOrganizationId(organizationId: string | null) {
  if (typeof window === "undefined") return;
  if (!organizationId) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, organizationId);
}

export function clearStoredOrganizationId() {
  setStoredOrganizationId(null);
}

export function getCachedWorkspaceAccess(): WorkspaceAccessState | null {
  if (cachedWorkspaceAccess) {
    if (Date.now() - cachedWorkspaceAccess.at <= CACHE_TTL_MS) {
      return cachedWorkspaceAccess.state;
    }
    cachedWorkspaceAccess = null;
  }
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state: WorkspaceAccessState; at: number };
    if (!parsed || !parsed.state || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    if (parsed.state.kind === "ready" || parsed.state.kind === "pending") {
      cachedWorkspaceAccess = parsed;
      return parsed.state;
    }
    return null;
  } catch {
    return null;
  }
}

function isCacheUsableForUser(state: WorkspaceAccessState | null, initialUser: WorkspaceUser | null | undefined) {
  if (!state) return false;
  if (initialUser === undefined) return true;
  if (!initialUser) return state.kind === "signed_out";
  return Boolean(state.user && state.user.id === initialUser.id);
}

export function setCachedWorkspaceAccess(state: WorkspaceAccessState) {
  cachedWorkspaceAccess = { state, at: Date.now() };
  if (typeof window === "undefined") return;
  try {
    if (state.kind === "ready" || state.kind === "pending") {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ state, at: Date.now() }));
    } else if (state.kind === "signed_out") {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota or disabled errors
  }
}

export function clearCachedWorkspaceAccess() {
  cachedWorkspaceAccess = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function resetWorkspaceAccessCache() {
  clearCachedWorkspaceAccess();
}

function loadingState(): WorkspaceAccessState {
  return {
    kind: "loading",
    user: null,
    organizations: [],
    activeOrganization: null,
    pendingRequest: null,
    canManageAccess: false,
    error: null,
  };
}

function errorState(message: string, user: WorkspaceUser | null = null): WorkspaceAccessState {
  return {
    kind: "error",
    user,
    organizations: [],
    activeOrganization: null,
    pendingRequest: null,
    canManageAccess: false,
    error: message,
  };
}

function signedOutState(): WorkspaceAccessState {
  return {
    kind: "signed_out",
    user: null,
    organizations: [],
    activeOrganization: null,
    pendingRequest: null,
    canManageAccess: false,
  };
}

function normalizeName(name: string | null | undefined, email: string | null | undefined) {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (email) return email.split("@")[0] || email;
  return "Creator";
}

function formatInsforgeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const details = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = typeof details.message === "string" ? details.message : "";
    const extra = typeof details.details === "string" ? details.details : typeof details.hint === "string" ? details.hint : "";
    if (message && extra && !message.includes(extra)) return `${message} (${extra})`;
    if (message) return message;
    if (typeof details.code === "string") return `${fallback} (${details.code})`;
  }
  return fallback;
}

function isMissingRefreshTokenError(error: unknown) {
  return error instanceof Error && /no refresh token/i.test(error.message);
}

function toWorkspaceUser(user: { id: string; email?: string | null; profile?: { name?: string | null } | null }): WorkspaceUser {
  return {
    id: user.id,
    email: user.email ?? null,
    name: normalizeName(user.profile?.name, user.email ?? null),
  };
}

async function getCurrentWorkspaceUser() {
  const { data, error } = await insforge.auth.getCurrentUser();
  if (error) {
    if (isMissingRefreshTokenError(error)) return null;
    throw error;
  }
  return data?.user ? toWorkspaceUser(data.user) : null;
}

async function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 8000) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timer]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function retry<T>(operation: () => Promise<T>, attempts = 1) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function loadWorkspaceAccess(initialUser?: WorkspaceUser | null): Promise<WorkspaceAccessState> {
  const user = initialUser === undefined ? await getCurrentWorkspaceUser() : initialUser;
  if (!user) {
    return signedOutState();
  }

  const membershipResult = await retry(async () => {
    const result = await insforge.database
      .from("organization_members")
      .select("organization_id, role, organizations(id, name, slug)")
      .eq("user_id", user.id);
    if (result.error) throw result.error;
    return result;
  });
  let requestResult: { data: unknown[] | null } = { data: [] };
  try {
    requestResult = await retry(async () => {
      const result = await insforge.database
        .from("organization_access_requests")
        .select("id, organization_id, organization_name, organization_slug, requested_role, status, review_notes, reviewed_at")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .limit(1);
      if (result.error) throw result.error;
      return result;
    });
  } catch {
    // Access requests are supplementary. A temporary failure here must not lock out a verified workspace.
    requestResult = { data: [] };
  }

  const memberships = (membershipResult.data ?? []) as Array<{
    organization_id: string;
    role: string;
    organizations?: { id: string; name: string; slug: string } | Array<{ id: string; name: string; slug: string }> | null;
  }>;
  const pendingRequest = ((requestResult.data ?? [])[0] ?? null) as WorkspaceRequest | null;

  if (memberships.length === 0) {
    if (pendingRequest) {
      return {
        kind: "pending",
        user,
        organizations: [],
        activeOrganization: {
          id: pendingRequest.organization_id,
          name: pendingRequest.organization_name,
          slug: pendingRequest.organization_slug,
          role: pendingRequest.requested_role,
        },
        pendingRequest,
        canManageAccess: false,
      };
    }

    return {
      kind: "ready",
      user,
      organizations: [],
      activeOrganization: {
        id: "",
        name: "No workspace selected",
        slug: "",
        role: "viewer",
      },
      pendingRequest: null,
      canManageAccess: false,
    };
  }

  const organizations = memberships.flatMap((membership) => {
    const joined = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations;
    if (!joined) return [];
    return {
      id: joined.id,
      name: joined.name,
      slug: joined.slug,
      role: membership.role ?? "viewer",
    };
  });

  const storedOrganizationId = getStoredOrganizationId();
  const activeOrganization =
    organizations.find((organization) => organization.id === storedOrganizationId) ?? organizations[0];

  if (storedOrganizationId && !organizations.some((organization) => organization.id === storedOrganizationId)) {
    setStoredOrganizationId(activeOrganization?.id ?? null);
  } else if (!storedOrganizationId && activeOrganization) {
    setStoredOrganizationId(activeOrganization.id);
  }

  return {
    kind: "ready",
    user,
    organizations,
    activeOrganization,
    pendingRequest,
    canManageAccess: activeOrganization ? ["owner", "admin"].includes(activeOrganization.role) : false,
  };
}

type WorkspaceAccessContextValue = {
  state: WorkspaceAccessState;
  loading: boolean;
  refresh: (options?: { force?: boolean }) => Promise<WorkspaceAccessState>;
  setActiveOrganizationId: typeof setStoredOrganizationId;
  clearActiveOrganizationId: typeof clearStoredOrganizationId;
};

const WorkspaceAccessContext = createContext<WorkspaceAccessContextValue | null>(null);

export function WorkspaceAccessProvider({ children, initialUser }: { children: ReactNode; initialUser?: WorkspaceUser | null }) {
  const [state, setState] = useState<WorkspaceAccessState>(() => {
    const cachedState = getCachedWorkspaceAccess();
    if (cachedState && isCacheUsableForUser(cachedState, initialUser)) return cachedState;
    return loadingState();
  });
  const [sessionUser, setSessionUser] = useState<WorkspaceUser | null | undefined>(initialUser);
  const bootstrappedRef = useRef(false);
  const refresh = useCallback(async (options?: { force?: boolean }) => {
    const cachedState = options?.force ? null : getCachedWorkspaceAccess();
    if (cachedState && isCacheUsableForUser(cachedState, sessionUser)) {
      setState(cachedState);
      return cachedState;
    }
    if (workspaceRefreshPromise) return workspaceRefreshPromise;
    setState((current) => (current.kind === "ready" || current.kind === "pending" ? current : loadingState()));
    workspaceRefreshPromise = (async () => {
      try {
        const nextState = await withTimeout(
          retry(() => loadWorkspaceAccess(undefined)),
          "Workspace restore timed out. Please try again.",
          8000,
        );
        setState(nextState);
        setCachedWorkspaceAccess(nextState);
        if (nextState.kind === "signed_out") {
          setSessionUser(null);
          clearCachedWorkspaceAccess();
          clearStoredOrganizationId();
        } else if (nextState.user) {
          setSessionUser(nextState.user);
        }
        return nextState;
      } catch (cause) {
        if (isMissingRefreshTokenError(cause)) {
          const nextState = signedOutState();
          setState(nextState);
          setCachedWorkspaceAccess(nextState);
          clearStoredOrganizationId();
          return nextState;
        }
        // Fallback to cached state on transient network failure
        const fallback = getCachedWorkspaceAccess();
        if (fallback && (fallback.kind === "ready" || fallback.kind === "pending")) {
          setState(fallback);
          return fallback;
        }
        const nextState = errorState(cause instanceof Error ? cause.message : "Unable to load workspace access.");
        setState(nextState);
        return nextState;
      } finally {
        workspaceRefreshPromise = null;
      }
    })();
    return workspaceRefreshPromise;
  }, [sessionUser]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const value = useMemo(
    () => ({
      state,
      loading: state.kind === "loading",
      refresh,
      setActiveOrganizationId: (organizationId: string | null) => {
        clearCachedWorkspaceAccess();
        setStoredOrganizationId(organizationId);
      },
      clearActiveOrganizationId: () => {
        clearCachedWorkspaceAccess();
        clearStoredOrganizationId();
      },
    }),
    [refresh, state],
  );

  return createElement(WorkspaceAccessContext.Provider, { value }, children);
}

export function useWorkspaceAccess() {
  const context = useContext(WorkspaceAccessContext);
  if (!context) {
    throw new Error("useWorkspaceAccess must be used inside WorkspaceAccessProvider.");
  }
  return context;
}

export async function createWorkspace(input: { name: string; slug: string; seed?: boolean }) {
  const { data, error } = await insforge.database.rpc("create_organization_with_owner", {
    p_name: input.name,
    p_slug: input.slug,
  });
  if (error) throw error;

  if (input.seed) {
    const seedResult = await insforge.database.rpc("seed_workspace_demo", { p_organization_id: data });
    if (seedResult.error) throw seedResult.error;
  }

  return data as string;
}

export async function requestCompanyAccess(input: { slug: string; requestedRole?: string; user?: WorkspaceUser | null }) {
  const slug = input.slug.trim().toLowerCase();
  if (!slug) throw new Error("Enter a company code.");

  const requestedRole = input.requestedRole === "editor" ? "editor" : "viewer";
  const accessToken = getBrowserAccessToken();
  const response = await fetch("/api/auth/workspace-access-request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ slug, requestedRole }),
  });
  const body = (await response.json().catch(() => null)) as { requestId?: string; message?: string } | null;
  if (!response.ok) throw new Error(body?.message || "Could not request access.");
  return body?.requestId ?? "";
}

export async function approveWorkspaceAccessRequest(requestId: string, role?: string) {
  const { data, error } = await insforge.database.rpc("approve_organization_access_request", {
    p_request_id: requestId,
    p_role: role ?? null,
  });
  if (error) throw new Error(formatInsforgeError(error, "Could not approve the access request."));
  return data as string;
}

export async function rejectWorkspaceAccessRequest(requestId: string, notes?: string) {
  const { data, error } = await insforge.database.rpc("reject_organization_access_request", {
    p_request_id: requestId,
    p_review_notes: notes ?? null,
  });
  if (error) throw new Error(formatInsforgeError(error, "Could not reject the access request."));
  return data as string;
}

export async function signOutWorkspace() {
  clearCachedWorkspaceAccess();
  clearStoredOrganizationId();
  try {
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin" });
  } catch {
    // Ignore network error on sign-out endpoint
  }
  await insforge.auth.signOut().catch(() => undefined);
}
