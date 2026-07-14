"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, Download, LoaderCircle, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspaceAccess } from "@/features/workspace/workspace-access";
import { insforge } from "@/lib/insforge/browser";
import type { DashboardData } from "./types";
import { canManageRecords as roleCanManageRecords } from "@/features/workspace/permissions";

const stageOrder = ["idea", "script", "editing", "review", "published"] as const;
const progressBands = [
  { label: "0-20", min: 0, max: 20 },
  { label: "21-40", min: 21, max: 40 },
  { label: "41-60", min: 41, max: 60 },
  { label: "61-80", min: 61, max: 80 },
  { label: "81-100", min: 81, max: 100 },
] as const;

function countBy<T extends string>(values: T[], keys: readonly T[]) {
  return Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length])) as Record<T, number>;
}

function percent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function asCsv(rows: Array<Record<string, unknown>>) {
  const headers = ["title", "channel", "stage", "progress", "due_date"];
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

async function retryDataLoad<T>(operation: () => Promise<T>, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function DashboardView() {
  const { state, loading: accessLoading, refresh } = useWorkspaceAccess();
  const activeOrganizationId = state.kind === "ready" ? state.activeOrganization.id : "";
  const canExport = state.kind === "ready" && roleCanManageRecords(state.activeOrganization.role);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const isInitialLoading = loading && !data;
  const isRefreshing = loading && !!data;

  const loadData = useCallback(async (organizationId: string) => {
    setLoading(true);
    try {
      const [contentResult, taskResult, sponsorResult, courseResult] = await retryDataLoad(() => Promise.all([
        insforge.database
          .from("content_items")
          .select("id,title,channel,stage,progress,due_date")
          .eq("organization_id", organizationId)
          .order("due_date", { ascending: true })
          .limit(100),
        insforge.database.from("tasks").select("status").eq("organization_id", organizationId).limit(500),
        insforge.database.from("sponsorships").select("amount,status").eq("organization_id", organizationId).limit(500),
        insforge.database.from("courses").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "published"),
      ]).then((results) => {
        const failed = results.find((result) => result.error);
        if (failed?.error) throw failed.error;
        return results;
      }));

      if (contentResult.error || taskResult.error || sponsorResult.error || courseResult.error) {
        throw contentResult.error || taskResult.error || sponsorResult.error || courseResult.error;
      }

      const content = (contentResult.data ?? []).map((item) => ({
        id: String(item.id),
        title: String(item.title),
        channel: String(item.channel ?? "Unassigned"),
        stage: String(item.stage ?? "idea"),
        progress: Number(item.progress ?? 0),
        dueDate: item.due_date ? String(item.due_date) : null,
      }));
      const taskCounts = countBy(
        (taskResult.data ?? []).map((row) => String(row.status ?? "todo")) as Array<"todo" | "in_progress" | "done">,
        ["todo", "in_progress", "done"],
      );
      const sponsorCounts = countBy(
        (sponsorResult.data ?? []).map((row) => String(row.status ?? "lead")) as Array<"lead" | "negotiating" | "active" | "completed" | "lost">,
        ["lead", "negotiating", "active", "completed", "lost"],
      );
      const pipeline = (sponsorResult.data ?? []).reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
      const stageCounts = Object.fromEntries(stageOrder.map((stage) => [stage, content.filter((item) => item.stage === stage).length]));
      const channelCounts = Object.fromEntries(
        content.reduce<Map<string, number>>((acc, item) => {
          const key = item.channel.toLowerCase();
          acc.set(key, (acc.get(key) ?? 0) + 1);
          return acc;
        }, new Map()).entries(),
      );
      const progressBandCounts = Object.fromEntries(
        progressBands.map((band) => [
          band.label,
          content.filter((item) => item.progress >= band.min && item.progress <= band.max).length,
        ]),
      );

      setData({
        source: "live",
        content,
        stageCounts: stageCounts as Record<string, number>,
        taskCounts,
        sponsorCounts,
        channelCounts: channelCounts as Record<string, number>,
        progressBands: progressBandCounts as Record<string, number>,
        metrics: [
          { label: "Published this month", value: String(stageCounts.published ?? 0), detail: "From your content pipeline", trend: 0 },
          { label: "Tasks completed", value: String(taskCounts.done ?? 0), detail: "Completed tasks", trend: 0 },
          { label: "Revenue in pipeline", value: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(pipeline), detail: "Active sponsor opportunities", trend: 0 },
          { label: "Published courses", value: String(courseResult.count ?? 0), detail: "Courses currently live", trend: 0 },
        ],
      });
    } catch (cause) {
      setData({
        source: "unavailable",
        metrics: [],
        content: [],
        stageCounts: Object.fromEntries(stageOrder.map((stage) => [stage, 0])),
        taskCounts: { todo: 0, in_progress: 0, done: 0 },
        sponsorCounts: { lead: 0, negotiating: 0, active: 0, completed: 0, lost: 0 },
        channelCounts: {},
        progressBands: Object.fromEntries(progressBands.map((band) => [band.label, 0])),
        message: cause instanceof Error ? cause.message : "Could not reach the CreoOS data service.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessLoading || state.kind !== "ready" || !activeOrganizationId) return;
    queueMicrotask(() => {
      void loadData(activeOrganizationId);
    });
  }, [accessLoading, activeOrganizationId, loadData, state.kind]);

  const unavailableMessage =
    state.kind === "pending"
      ? `${state.activeOrganization.name} still needs admin approval before the workspace opens.`
      : state.kind === "ready" && !activeOrganizationId
        ? "Create a company or request access to one before opening the dashboard."
        : null;

  const filteredContent = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data?.content ?? [];
    return (data?.content ?? []).filter((item) =>
      [item.title, item.channel, item.stage, item.dueDate ?? ""].some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [data?.content, search]);

  const exportCsv = useCallback(() => {
    if (!filteredContent.length) return;
    const blob = new Blob([asCsv(filteredContent as Array<Record<string, unknown>>)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "creoos-dashboard-content.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [filteredContent]);

  const stageTotal = Object.values(data?.stageCounts ?? {}).reduce((sum, count) => sum + count, 0);
  const taskTotal = Object.values(data?.taskCounts ?? {}).reduce((sum, count) => sum + count, 0);
  const sponsorTotal = Object.values(data?.sponsorCounts ?? {}).reduce((sum, count) => sum + count, 0);
  const averageProgress = filteredContent.length
    ? Math.round(filteredContent.reduce((sum, item) => sum + item.progress, 0) / filteredContent.length)
    : 0;
  const publishedRate = percent(data?.stageCounts.published ?? 0, stageTotal);
  const topChannels = Object.entries(data?.channelCounts ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const dueSoon = filteredContent.filter((item) => item.dueDate).slice(0, 4);

  return (
    <main className="dashboard">
      <header className="dashboard-head">
        <div>
          <span className="eyebrow">CreoOS / workspace</span>
          <h1>Overview</h1>
          <p>Everything moving through your creator business, in one place.</p>
        </div>
        <div className="button-row">
          {canExport && <Button asChild className="primary-button"><Link href="/content"><Plus size={17} /> New content</Link></Button>}
        </div>
      </header>

      <div className="module-toolbar">
        <label className="search-box">
          <Search size={17} />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search content, channels, or dates" />
        </label>
        <Button variant="outline" onClick={exportCsv} disabled={!canExport || filteredContent.length === 0}>
          <Download size={16} />
          Export CSV
        </Button>
      </div>

      {isRefreshing && (
        <div className="refresh-banner">
          <LoaderCircle size={14} className="spin" />
          <span>Refreshing live dashboard</span>
        </div>
      )}

      {unavailableMessage ? (
        <ConnectionState message={unavailableMessage} onRetry={() => refresh()} />
      ) : isInitialLoading ? (
        <LoadingState />
      ) : data?.source === "unavailable" ? (
        <ConnectionState message={data.message} onRetry={() => loadData(activeOrganizationId)} />
      ) : (
        <>
          <section className="metrics-grid">
            {data?.metrics.map((metric) => (
              <article className="metric" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <p>{metric.detail}</p>
              </article>
            ))}
          </section>

          <section className="overview-analytics">
            <article className="analytics-card progress-overview">
              <div>
                <span className="eyebrow">Content health</span>
                <h2>{averageProgress}% average progress</h2>
                <p>Published rate is {publishedRate}% across {stageTotal} live content items.</p>
              </div>
              <div
                className="donut-ring compact-ring"
                style={{
                  background: `conic-gradient(#f1691b 0 ${averageProgress}%, #26231f ${averageProgress}% 100%)`,
                }}
              >
                <div>
                  <strong>{averageProgress}%</strong>
                  <span>ready</span>
                </div>
              </div>
            </article>

            <article className="analytics-card channel-overview">
              <span className="eyebrow">Channel mix</span>
              <div className="channel-pills">
                {topChannels.length ? (
                  topChannels.map(([channel, count]) => (
                    <span key={channel}>
                      {channel}
                      <b>{count}</b>
                    </span>
                  ))
                ) : (
                  <p className="table-empty">No channels yet.</p>
                )}
              </div>
            </article>

            <article className="analytics-card deadline-overview">
              <span className="eyebrow">Closest deadlines</span>
              <div className="deadline-list">
                {dueSoon.length ? (
                  dueSoon.map((item) => (
                    <div key={item.id}>
                      <strong>{item.title}</strong>
                      <span>
                        {item.dueDate
                          ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(item.dueDate))
                          : "No date"}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="table-empty">No upcoming content deadlines.</p>
                )}
              </div>
            </article>
          </section>

          <section className="dashboard-grid">
            <div className="dashboard-stack">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Content operations</span>
                  <h2>Production pipeline</h2>
                </div>
                <span className="live-label">
                  <i /> Live data
                </span>
              </div>
              <section className="chart-grid">
                {stageOrder.map((stage) => {
                  const count = data?.stageCounts[stage] ?? 0;
                  return (
                    <article className="chart-card" key={stage}>
                      <div className="chart-card-head">
                        <span>{stage}</span>
                        <strong>{count}</strong>
                      </div>
                      <div className="chart-bar-shell">
                        <i style={{ width: `${percent(count, stageTotal)}%` }} />
                      </div>
                    </article>
                  );
                })}
              </section>

              <div className="section-heading content-heading">
                <div>
                  <span className="eyebrow">Closest deadlines</span>
                  <h2>Content queue</h2>
                </div>
              </div>
              <section className="content-table">
                {filteredContent.length === 0 ? (
                  <p className="table-empty">No content has been created in InsForge yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Due</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContent.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <strong>{item.title}</strong>
                          </TableCell>
                          <TableCell>{item.channel}</TableCell>
                          <TableCell>
                            <span className="stage-badge">{item.stage}</span>
                          </TableCell>
                          <TableCell>
                            <div className="cell-progress">
                              <div className="cell-progress-track">
                                <i style={{ width: `${item.progress}%` }} />
                              </div>
                              <span>{item.progress}%</span>
                            </div>
                          </TableCell>
                          <TableCell>{item.dueDate ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(item.dueDate)) : "No due date"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
            </div>

            <aside className="insights-panel">
              <span className="eyebrow">Workspace intelligence</span>
              <h2>Workspace signals</h2>
              <p>Live metrics, channel mix, and delivery flow from the current company.</p>

              <div className="chart-card">
                <div className="chart-card-head">
                  <span>Tasks</span>
                  <strong>{taskTotal}</strong>
                </div>
                <div className="mini-bars">
                  {(["todo", "in_progress", "done"] as const).map((status) => {
                    const count = data?.taskCounts[status] ?? 0;
                    return (
                      <div key={status}>
                        <label>{status}</label>
                        <div className="chart-bar-shell">
                          <i style={{ width: `${percent(count, taskTotal)}%` }} />
                        </div>
                        <span>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="chart-card">
                <div className="chart-card-head">
                  <span>Sponsors</span>
                  <strong>{sponsorTotal}</strong>
                </div>
                <div className="mini-bars">
                  {(["lead", "negotiating", "active", "completed", "lost"] as const).map((status) => {
                    const count = data?.sponsorCounts[status] ?? 0;
                    return (
                      <div key={status}>
                        <label>{status}</label>
                        <div className="chart-bar-shell">
                          <i style={{ width: `${percent(count, sponsorTotal)}%` }} />
                        </div>
                        <span>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="chart-card">
                <div className="chart-card-head">
                  <span>Channels</span>
                  <strong>{Object.keys(data?.channelCounts ?? {}).length}</strong>
                </div>
                <div className="mini-bars">
                  {Object.entries(data?.channelCounts ?? {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([channel, count]) => (
                      <div key={channel}>
                        <label>{channel}</label>
                        <div className="chart-bar-shell">
                          <i style={{ width: `${percent(count, Math.max(filteredContent.length, 1))}%` }} />
                        </div>
                        <span>{count}</span>
                      </div>
                    ))}
                </div>
              </div>

              <div className="chart-card">
                <div className="chart-card-head">
                  <span>Progress</span>
                  <strong>{Object.values(data?.progressBands ?? {}).reduce((sum, count) => sum + count, 0)}</strong>
                </div>
                <div className="mini-bars">
                  {Object.entries(data?.progressBands ?? {}).map(([band, count]) => (
                    <div key={band}>
                      <label>{band}%</label>
                      <div className="chart-bar-shell">
                        <i style={{ width: `${percent(count, Math.max(filteredContent.length, 1))}%` }} />
                      </div>
                      <span>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}

function LoadingState() {
  return (
    <section className="loading-surface">
      <LoaderCircle size={22} className="spin" />
      <div>
        <strong>Loading your live workspace</strong>
        <p>Collecting the latest dashboard data.</p>
      </div>
    </section>
  );
}

function ConnectionState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <section className="connection-state">
      <CircleAlert size={23} />
      <div>
        <span className="eyebrow">Workspace data unavailable</span>
        <h2>Your live workspace is not available yet</h2>
        <p>{message || "Link this project and create the CreoOS tables to begin loading real business data."}</p>
        <button className="primary-button" onClick={onRetry}>
          <RefreshCw size={16} /> Try again
        </button>
      </div>
    </section>
  );
}
