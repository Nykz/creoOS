"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, LoaderCircle, PencilLine, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DatePicker } from "@/components/date-picker";
import {
  resources,
  type ResourceField,
  type ResourceKey,
  type ResourceColumn,
} from "@/features/resources/resource-config";
import { useWorkspaceAccess } from "@/features/workspace/workspace-access";
import { canManageRecords as roleCanManageRecords } from "@/features/workspace/permissions";
import { canManageAccess as roleCanManageAccess } from "@/features/workspace/permissions";
import { getBrowserAccessToken } from "@/lib/insforge/browser";

type ResourceRow = Record<string, unknown> & {
  id: string;
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
};

type FieldOption = { value: string; label: string };

type DialogMode = "create" | "edit";

const contentProgressByStage = {
  idea: 10,
  script: 30,
  editing: 60,
  review: 85,
  published: 100,
} as const;

function toText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function formatDate(value: unknown) {
  const text = toText(value);
  if (!text) return "—";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatCurrency(value: unknown, currency = "USD") {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
}

function slugifyLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function defaultDraft(fields: ResourceField[], defaults?: Record<string, string>, record?: ResourceRow | null) {
  return Object.fromEntries(
    fields.map((field) => [field.name, toText(record?.[field.name] ?? defaults?.[field.name] ?? "")]),
  ) as Record<string, string>;
}

function asCsv(rows: ResourceRow[], columns: ResourceColumn[]) {
  const escape = (value: unknown) => {
    const text = toText(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [columns.map((column) => escape(column.label)).join(","), ...rows.map((row) => columns.map((column) => escape(row[column.key])).join(","))].join("\n");
}

async function mutateResource(
  resource: ResourceKey,
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown>,
) {
  const accessToken = getBrowserAccessToken();
  const response = await fetch(`/api/resources/${resource}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) {
    throw new Error(result?.message ?? "Unable to save the workspace record.");
  }
  return result as { record?: ResourceRow | null; ok?: boolean };
}

async function fetchResource(resource: ResourceKey, organizationId: string) {
  const searchParams = new URLSearchParams({ organizationId });
  const accessToken = getBrowserAccessToken();
  const response = await fetch(`/api/resources/${resource}?${searchParams.toString()}`, {
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: "same-origin",
  });
  const result = (await response.json().catch(() => null)) as {
    message?: string;
    records?: ResourceRow[];
    memberOptions?: FieldOption[];
    contentOptions?: FieldOption[];
  } | null;

  if (!response.ok) {
    throw new Error(result?.message ?? "Unable to load workspace records.");
  }

  return {
    records: result?.records ?? [],
    memberOptions: result?.memberOptions ?? [],
    contentOptions: result?.contentOptions ?? [],
  };
}

export function ModulePage({ title, description, action, resource }: { title: string; description: string; action: string; resource: ResourceKey }) {
  const router = useRouter();
  const config = resources[resource];
  const fields = config.fields as ResourceField[];
  const defaults = (config.defaultValues ?? {}) as Record<string, string>;
  const { state, loading: accessLoading } = useWorkspaceAccess();
  const activeOrganizationId = state.kind === "ready" ? state.activeOrganization.id : "";
  const canManageRecords = state.kind === "ready" && roleCanManageRecords(state.activeOrganization.role);
  const canAssignTasks = resource === "tasks" && state.kind === "ready" && roleCanManageAccess(state.activeOrganization.role);
  const [records, setRecords] = useState<ResourceRow[]>([]);
  const [memberOptions, setMemberOptions] = useState<FieldOption[]>([]);
  const [contentOptions, setContentOptions] = useState<FieldOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [selectedRecord, setSelectedRecord] = useState<ResourceRow | null>(null);
  const [saving, setSaving] = useState(false);
  const initialLoading = loading && records.length === 0;
  const refreshing = loading && records.length > 0;

  const load = useCallback(
    async (organizationId: string) => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchResource(resource, organizationId);
        setRecords(next.records);
        setMemberOptions(next.memberOptions);
        setContentOptions(next.contentOptions);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load workspace records.");
      } finally {
        setLoading(false);
      }
    },
    [resource],
  );

  useEffect(() => {
    if (accessLoading || state.kind !== "ready" || !activeOrganizationId) return;
    queueMicrotask(() => {
      void load(activeOrganizationId);
    });
  }, [accessLoading, activeOrganizationId, load, state.kind]);

  const visibleRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;
    return records.filter((record) =>
      config.searchFields.some((field) => slugifyLabel(toText(record[field])).includes(term)),
    );
  }, [config.searchFields, records, search]);

  const tableRows = useMemo(() => {
    if (resource !== "tasks") return visibleRecords;
    const memberLabelById = new Map(memberOptions.map((member) => [member.value, member.label]));
    const contentLabelById = new Map(contentOptions.map((content) => [content.value, content.label]));
    return visibleRecords.map((record) => ({
      ...record,
      assignee_label: record.assignee_id ? memberLabelById.get(String(record.assignee_id)) ?? String(record.assignee_id) : "Unassigned",
      content_item_label: record.content_item_id ? contentLabelById.get(String(record.content_item_id)) ?? String(record.content_item_id) : "None",
    }));
  }, [contentOptions, memberOptions, resource, visibleRecords]);

  function openCreateDialog() {
    setSelectedRecord(null);
    setDraft(defaultDraft(fields, defaults));
    setDialogMode("create");
  }

  function openEditDialog(record: ResourceRow) {
    setSelectedRecord(record);
    setDraft(defaultDraft(fields, defaults, record));
    setDialogMode("edit");
  }

  function closeDialog() {
    setDialogMode(null);
    setSelectedRecord(null);
    setDraft({});
  }

  function fieldOptions(field: ResourceField) {
    if (field.options) return field.options;
    if (field.optionsSource === "members") return memberOptions;
    if (field.optionsSource === "content") return contentOptions;
    return [];
  }

  function buildPayload() {
    const payload: Record<string, unknown> = {};
    for (const field of fields) {
      if (resource === "tasks" && field.name === "assignee_id" && !canAssignTasks) continue;
      const raw = draft[field.name] ?? "";
      if (resource === "content" && field.name === "progress") {
        continue;
      }
      if (field.kind === "number") {
        if (raw === "") {
          payload[field.name] = null;
          continue;
        }
        payload[field.name] = Number(raw);
        continue;
      }
      if (field.kind === "date") {
        payload[field.name] = raw || null;
        continue;
      }
      if (field.kind === "select") {
        payload[field.name] = raw || null;
        continue;
      }
      payload[field.name] = raw.trim();
    }

    if (resource === "content") {
      const stage = String(payload.stage ?? defaults["stage"] ?? "idea");
      payload.stage = stage;
      payload.progress = contentProgressByStage[stage as keyof typeof contentProgressByStage] ?? Number(defaults["progress"] ?? 10);
    }

    return payload;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind !== "ready" || !activeOrganizationId || !state.user) return;

    setSaving(true);
    setError(null);

    try {
      const payload = buildPayload();
      let savedRecord: ResourceRow | null | undefined;
      if (dialogMode === "create") {
        const result = await mutateResource(resource, "POST", {
          organizationId: activeOrganizationId,
          payload,
        });
        savedRecord = result.record;
        if (savedRecord) {
          const recordToSave = savedRecord;
          setRecords((current) => [recordToSave, ...current.filter((record) => record.id !== recordToSave.id)]);
        }
      } else if (selectedRecord) {
        const result = await mutateResource(resource, "PATCH", {
          organizationId: activeOrganizationId,
          id: selectedRecord.id,
          payload,
        });
        savedRecord = result.record;
        if (savedRecord) {
          const recordToSave = savedRecord;
          setRecords((current) => current.map((record) => (record.id === recordToSave.id ? recordToSave : record)));
        }
      }

      closeDialog();
      await load(activeOrganizationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to save the ${config.label}.`);
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(record: ResourceRow) {
    if (!activeOrganizationId) return;
    if (!window.confirm(`Delete this ${config.label}? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      await mutateResource(resource, "DELETE", {
        organizationId: activeOrganizationId,
        id: record.id,
      });
      setRecords((current) => current.filter((item) => item.id !== record.id));
      await load(activeOrganizationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to delete the ${config.label}.`);
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const csv = asCsv(tableRows, config.columns);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${config.table}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function renderCell(record: ResourceRow, column: ResourceColumn) {
    const value = record[column.key];
    switch (column.kind) {
      case "status":
        return <Badge variant="outline">{toText(value) || "—"}</Badge>;
      case "currency":
        return <span>{formatCurrency(value, String(record.currency ?? "USD"))}</span>;
      case "date":
        return <span>{formatDate(value)}</span>;
      case "number":
        return <span>{toText(value) || "0"}</span>;
      case "progress":
        return (
          <div className="cell-progress">
            <div className="cell-progress-track">
              <i style={{ width: `${Number(value ?? 0)}%` }} />
            </div>
            <span>{toText(value) || "0"}%</span>
          </div>
        );
      default:
        return <span>{toText(value) || "—"}</span>;
    }
  }

  function getRecordLabel(record: ResourceRow) {
    return toText(record.title ?? record.name ?? config.label);
  }

  if (state.kind === "pending") {
    return (
      <main className="module-page">
        <header className="module-header">
          <div>
            <span className="eyebrow">CreoOS workspace</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </header>
        <section className="empty-surface">
          <h2>Awaiting approval</h2>
          <p>
            Your account is tied to <strong>{state.activeOrganization.name}</strong> and is waiting for an admin to verify access. You can
            change company before approval if needed.
          </p>
          <div className="button-row">
            <Button className="primary-button" onClick={() => router.push("/onboarding")}>
              Switch company
            </Button>
          </div>
        </section>
      </main>
    );
  }

  if (state.kind === "loading" && records.length === 0) {
    return (
      <section className="loading-surface">
        <LoaderCircle size={22} className="spin" />
        <div>
          <strong>Checking workspace access</strong>
          <p>Checking your workspace and live records.</p>
        </div>
      </section>
    );
  }

  if (state.kind !== "ready" || !state.activeOrganization.id) {
    return (
      <main className="module-page">
        <header className="module-header">
          <div>
            <span className="eyebrow">CreoOS workspace</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </header>
        <section className="empty-surface">
          <h2>Choose a company workspace first</h2>
          <p>Your {title.toLowerCase()} records will appear after you create or join a verified company.</p>
          <Button className="primary-button" onClick={() => router.push("/onboarding")}>
            Go to onboarding
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="module-page">
      <header className="module-header">
        <div>
          <span className="eyebrow">CreoOS workspace</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="button-row">
          <Button variant="outline" onClick={exportCsv} disabled={visibleRecords.length === 0}>
            <Download size={16} />
            Export CSV
          </Button>
          {canManageRecords && <Button className="primary-button" onClick={openCreateDialog}>
              <Plus size={17} />
              {action}
            </Button>}
        </div>
      </header>

      <div className="module-toolbar">
        <label className="search-box">
          <Search size={17} />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${title.toLowerCase()}`}
          />
        </label>
      </div>

      {refreshing && (
        <div className="refresh-banner">
          <LoaderCircle size={14} className="spin" />
          <span>Refreshing live records</span>
        </div>
      )}

      {error && (
        <section className="error-banner">
          <div>
            <h2>Could not save or load live data</h2>
            <p>{error}</p>
          </div>
          <Button variant="outline" className="ai-button" onClick={() => void load(activeOrganizationId)}>
            Try again
          </Button>
        </section>
      )}

      {initialLoading ? (
        <section className="loading-surface">
          <LoaderCircle size={22} className="spin" />
          <div>
            <strong>Loading live records</strong>
            <p>Pulling the latest data from your workspace.</p>
          </div>
        </section>
      ) : visibleRecords.length === 0 ? (
        <section className="empty-surface">
          <div className="empty-icon">
            <Plus size={20} />
          </div>
          <h2>{search ? `No ${config.label} matches your search` : `Start your ${title.toLowerCase()}`}</h2>
          <p>{search ? "Try another search term or clear the filter." : "There are no live records yet."}</p>
          {canManageRecords && <Button className="primary-button" onClick={openCreateDialog}>{action}</Button>}
        </section>
      ) : (
        <section className="datatable-surface">
          <div className="datatable-head">
            <strong>{visibleRecords.length} records</strong>
            <span>Sorted by {config.defaultOrderBy.column.replaceAll("_", " ")}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                {config.columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.map((record) => (
                <TableRow key={record.id}>
                  {config.columns.map((column) => (
                    <TableCell key={column.key}>{renderCell(record, column)}</TableCell>
                  ))}
                  <TableCell>
                    <div className="row-actions">
                      {canManageRecords ? <>
                        <Button variant="outline" className="icon-button" onClick={() => openEditDialog(record)} aria-label={`Edit ${getRecordLabel(record)}`}><PencilLine size={16} /></Button>
                        <Button variant="outline" className="icon-button" onClick={() => void removeRecord(record)} aria-label={`Delete ${getRecordLabel(record)}`}><Trash2 size={16} /></Button>
                      </> : <Badge variant="outline">View only</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="create-modal bg-[#171715] text-[#f3f1ea]" showCloseButton={false}>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{dialogMode === "edit" ? `Edit ${config.label}` : action}</DialogTitle>
              <DialogDescription className="text-[#9b978f]">
                {dialogMode === "edit" ? `Update the selected ${config.label}.` : `Create a live ${config.label} in the CreoOS workspace.`}
              </DialogDescription>
            </DialogHeader>
            {fields.map((field) => {
              const options = fieldOptions(field);
              const value = draft[field.name] ?? "";
              return (
                <label key={field.name}>
                  {field.label}
                  {field.kind === "select" ? (
                    <>
                      <select
                        name={field.name}
                        value={value}
                        required={field.required}
                        disabled={resource === "tasks" && field.name === "assignee_id" && !canAssignTasks}
                        onChange={(event) => setDraft((current) => ({ ...current, [field.name]: event.target.value }))}
                      >
                        <option value="">Select one</option>
                        {options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {resource === "tasks" && field.name === "assignee_id" && !canAssignTasks && <small className="field-help">Only owners and admins can assign tasks.</small>}
                    </>
                  ) : resource === "content" && field.name === "progress" ? (
                    <Input
                      name={field.name}
                      type="number"
                      value={String(contentProgressByStage[String(draft.stage ?? defaults["stage"] ?? "idea") as keyof typeof contentProgressByStage] ?? 10)}
                      disabled
                      placeholder="Auto-synced from stage"
                    />
                  ) : field.kind === "date" ? (
                    <DatePicker
                      value={value}
                      required={field.required}
                      min={field.min ? String(field.min) : undefined}
                      max={field.max ? String(field.max) : undefined}
                      ariaLabel={field.label}
                      onChange={(nextValue) => setDraft((current) => ({ ...current, [field.name]: nextValue }))}
                    />
                  ) : (
                    <Input
                      name={field.name}
                      type={field.kind === "number" ? "number" : "text"}
                      value={value}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      required={field.required}
                      placeholder={field.placeholder}
                      onChange={(event) => setDraft((current) => ({ ...current, [field.name]: event.target.value }))}
                    />
                  )}
                </label>
              );
            })}
            <Button className="primary-button" type="submit" disabled={saving}>
              {saving && <LoaderCircle size={16} className="spin" />}
              {dialogMode === "edit" ? "Save changes" : `Create ${config.label}`}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
