"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, LoaderCircle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useWorkspaceAccess } from "@/features/workspace/workspace-access";
import { insforge } from "@/lib/insforge/browser";
import { WorkspaceRoleGate } from "@/components/workspace-role-gate";

type StageKey = "idea" | "script" | "editing" | "review" | "published";
type TaskStatus = "todo" | "in_progress" | "done";
type SponsorStatus = "lead" | "negotiating" | "active" | "completed" | "lost";

type AnalyticsContentRow = {
  id: string;
  title: string;
  channel: string | null;
  stage: StageKey | string | null;
  progress: number | null;
  due_date: string | null;
};

type AnalyticsSnapshot = {
  metrics: Array<{ label: string; value: string; detail: string }>;
  content: Array<{
    id: string;
    title: string;
    channel: string;
    stage: StageKey | string;
    progress: number;
    dueDate: string | null;
  }>;
  stageCounts: Record<StageKey, number>;
  progressBands: Record<string, number>;
  taskCounts: Record<TaskStatus, number>;
  sponsorCounts: Record<SponsorStatus, number>;
  channelCounts: Record<string, number>;
  publishedRate: number;
  pipelineValue: number;
  dueSoon: Array<{ id: string; title: string; dueDate: string; stage: string }>;
};

const stageOrder: StageKey[] = ["idea", "script", "editing", "review", "published"];
const taskOrder: TaskStatus[] = ["todo", "in_progress", "done"];
const sponsorOrder: SponsorStatus[] = ["lead", "negotiating", "active", "completed", "lost"];
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function asCsv(rows: Array<Record<string, unknown>>) {
  const headers = ["title", "channel", "stage", "progress", "due_date"];
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

export default function AnalyticsPage() {
  return <WorkspaceRoleGate><AnalyticsContent /></WorkspaceRoleGate>;
}

function AnalyticsContent() {
  const { state, loading: accessLoading } = useWorkspaceAccess();
  const activeOrganizationId = state.kind === "ready" ? state.activeOrganization.id : "";
  const activeOrganization = state.kind === "ready" && state.activeOrganization.id ? state.activeOrganization : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);

  const isInitialLoading = loading && !snapshot;
  const isRefreshing = (loading || accessLoading) && !!snapshot;

  const load = useCallback(async () => {
    if (!activeOrganizationId) {
      setLoading(false);
      setSnapshot(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [contentResult, taskResult, sponsorResult, affiliateResult, courseResult] = await Promise.all([
        insforge.database
          .from("content_items")
          .select("id,title,channel,stage,progress,due_date")
          .eq("organization_id", activeOrganizationId)
          .order("due_date", { ascending: true })
          .limit(100),
        insforge.database.from("tasks").select("status").eq("organization_id", activeOrganizationId).limit(500),
        insforge.database.from("sponsorships").select("amount,status").eq("organization_id", activeOrganizationId).limit(500),
        insforge.database.from("affiliates").select("status").eq("organization_id", activeOrganizationId).limit(500),
        insforge.database.from("courses").select("status").eq("organization_id", activeOrganizationId).limit(500),
      ]);

      if (contentResult.error || taskResult.error || sponsorResult.error || affiliateResult.error || courseResult.error) {
        throw contentResult.error || taskResult.error || sponsorResult.error || affiliateResult.error || courseResult.error;
      }

      const content = ((contentResult.data ?? []) as AnalyticsContentRow[]).map((item) => ({
        id: item.id,
        title: item.title,
        channel: item.channel ?? "Unassigned",
        stage: item.stage ?? "idea",
        progress: Number(item.progress ?? 0),
        dueDate: item.due_date,
      }));
      const taskCounts = countBy(
        (taskResult.data ?? []).map((row) => String(row.status ?? "todo")) as TaskStatus[],
        taskOrder,
      );
      const sponsorCounts = countBy(
        (sponsorResult.data ?? []).map((row) => String(row.status ?? "lead")) as SponsorStatus[],
        sponsorOrder,
      );
      const stageCounts = countBy(
        content.map((item) => (stageOrder.includes(item.stage as StageKey) ? (item.stage as StageKey) : "idea")),
        stageOrder,
      );
      const channelCounts = Object.fromEntries(
        content.reduce<Map<string, number>>((acc, item) => {
          const key = item.channel.toLowerCase();
          acc.set(key, (acc.get(key) ?? 0) + 1);
          return acc;
        }, new Map()).entries(),
      );
      const progressBandsCounts = Object.fromEntries(
        progressBands.map((band) => [
          band.label,
          content.filter((item) => Number(item.progress) >= band.min && Number(item.progress) <= band.max).length,
        ]),
      );
      const pipelineValue = (sponsorResult.data ?? []).reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
      const publishedRate = content.length === 0 ? 0 : Math.round(((stageCounts.published ?? 0) / content.length) * 100);
      const dueSoon = content
        .filter((item) => item.dueDate)
        .slice(0, 5)
        .map((item) => ({ id: item.id, title: item.title, dueDate: item.dueDate as string, stage: item.stage }));

      setSnapshot({
        metrics: [
          { label: "Published this month", value: String(stageCounts.published ?? 0), detail: "From your content pipeline" },
          { label: "Tasks completed", value: String(taskCounts.done ?? 0), detail: "Completed tasks" },
          { label: "Revenue in pipeline", value: formatCurrency(pipelineValue), detail: "Active sponsor opportunities" },
          { label: "Published courses", value: String((courseResult.data ?? []).filter((row) => row.status === "published").length), detail: "Courses currently live" },
          { label: "Publish rate", value: `${publishedRate}%`, detail: "Content already shipped" },
        ],
        content,
        stageCounts,
        progressBands: progressBandsCounts as Record<string, number>,
        taskCounts,
        sponsorCounts,
        channelCounts: channelCounts as Record<string, number>,
        publishedRate,
        pipelineValue,
        dueSoon,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the CreoOS data service.");
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId]);

  useEffect(() => {
    if (!accessLoading && state.kind === "ready") {
      queueMicrotask(() => {
        void load();
      });
    }
  }, [accessLoading, load, state.kind]);

  const filteredContent = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return snapshot?.content ?? [];
    return (snapshot?.content ?? []).filter((item) =>
      [item.title, item.channel, item.stage, item.dueDate ?? ""].some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [search, snapshot?.content]);

  const exportCsv = () => {
    if (!filteredContent.length) return;
    const blob = new Blob([asCsv(filteredContent as Array<Record<string, unknown>>)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "creoos-analytics-content.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const stageTotal = Object.values(snapshot?.stageCounts ?? {}).reduce((sum, count) => sum + count, 0);
  const taskTotal = Object.values(snapshot?.taskCounts ?? {}).reduce((sum, count) => sum + count, 0);
  const sponsorTotal = Object.values(snapshot?.sponsorCounts ?? {}).reduce((sum, count) => sum + count, 0);
  const highestChannel = Object.entries(snapshot?.channelCounts ?? {}).sort((a, b) => b[1] - a[1])[0];

  if (isInitialLoading) {
    return (
      <main className="module-page">
        <header className="module-header">
          <div>
            <span className="eyebrow">CreoOS workspace</span>
            <h1>Analytics</h1>
            <p>Understand content, business, and team performance in one view.</p>
          </div>
        </header>
        <section className="loading-surface">
          <LoaderCircle size={22} className="spin" />
          <div>
            <strong>Loading analytics</strong>
            <p>Collecting live metrics from your workspace.</p>
          </div>
        </section>
      </main>
    );
  }

  if (!activeOrganizationId) {
    return (
      <main className="module-page">
        <header className="module-header">
          <div>
            <span className="eyebrow">CreoOS workspace</span>
            <h1>Analytics</h1>
            <p>Understand content, business, and team performance in one view.</p>
          </div>
        </header>
        <section className="empty-surface">
          <h2>Choose or create a company first</h2>
          <p>Your analytics will populate once a verified company workspace is active.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="module-page">
      <header className="module-header">
        <div>
          <span className="eyebrow">CreoOS workspace</span>
          <h1>Analytics</h1>
          <p>Understand content, business, and team performance in one view.</p>
        </div>
        <div className="button-row">
          <Button variant="outline" onClick={exportCsv} disabled={filteredContent.length === 0}>
            <BarChart3 size={16} />
            Export CSV
          </Button>
        </div>
      </header>

      <div className="module-toolbar analytics-toolbar">
        <label className="search-box">
          <Search size={17} />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search titles, stages, channels, or dates" />
        </label>
        <div className="toolbar-badges">
          <Badge variant="outline">{activeOrganization?.name ?? "Workspace"}</Badge>
          <Badge variant="outline">{activeOrganization?.role ?? "viewer"}</Badge>
        </div>
      </div>

      {isRefreshing && (
        <div className="refresh-banner">
          <LoaderCircle size={14} className="spin" />
          <span>Refreshing analytics</span>
        </div>
      )}

      {error && (
        <section className="error-banner">
          <div>
            <h2>Analytics service error</h2>
            <p>{error}</p>
          </div>
          <Button variant="outline" className="ai-button" onClick={() => void load()}>
            Retry
          </Button>
        </section>
      )}

      <section className="metrics-grid analytics-metrics">
        {snapshot?.metrics.map((metric) => (
          <article className="metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="analytics-grid">
        <Card className="analytics-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Content stages</span>
              <h2>Pipeline distribution</h2>
            </div>
            <span className="live-label">
              <i /> Live
            </span>
          </div>
          <div className="chart-bars">
            {stageOrder.map((stage) => {
              const count = snapshot?.stageCounts[stage] ?? 0;
              return (
                <div key={stage} className="chart-row">
                  <label>{stage}</label>
                  <div className="chart-bar-shell">
                    <i style={{ width: `${percent(count, stageTotal)}%` }} />
                  </div>
                  <span>{count}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="analytics-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Publish rate</span>
              <h2>{snapshot?.publishedRate ?? 0}%</h2>
            </div>
          </div>
          <div className="donut-card">
            <div
              className="donut-ring"
              style={{
                background: `conic-gradient(#f1691b 0 ${(snapshot?.publishedRate ?? 0)}%, #26231f ${(snapshot?.publishedRate ?? 0)}% 100%)`,
              }}
            >
              <div>
                <strong>{snapshot?.publishedRate ?? 0}%</strong>
                <span>published</span>
              </div>
            </div>
            <p className="small-copy">Track how much of your content pipeline has already shipped.</p>
          </div>
        </Card>

        <Card className="analytics-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Task flow</span>
              <h2>Delivery status</h2>
            </div>
          </div>
          <div className="chart-bars">
            {taskOrder.map((status) => {
              const count = snapshot?.taskCounts[status] ?? 0;
              return (
                <div key={status} className="chart-row">
                  <label>{status}</label>
                  <div className="chart-bar-shell">
                    <i style={{ width: `${percent(count, taskTotal)}%` }} />
                  </div>
                  <span>{count}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="analytics-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Sponsor pipeline</span>
              <h2>Revenue opportunities</h2>
            </div>
            <strong className="chart-total">{formatCurrency(snapshot?.pipelineValue ?? 0)}</strong>
          </div>
          <div className="chart-bars">
            {sponsorOrder.map((status) => {
              const count = snapshot?.sponsorCounts[status] ?? 0;
              return (
                <div key={status} className="chart-row">
                  <label>{status}</label>
                  <div className="chart-bar-shell">
                    <i style={{ width: `${percent(count, sponsorTotal)}%` }} />
                  </div>
                  <span>{count}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="analytics-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Content progress</span>
              <h2>Completion bands</h2>
            </div>
          </div>
          <div className="chart-bars">
            {progressBands.map((band) => {
              const count = snapshot?.progressBands[band.label] ?? 0;
              return (
                <div key={band.label} className="chart-row">
                  <label>{band.label}%</label>
                  <div className="chart-bar-shell">
                    <i style={{ width: `${percent(count, Math.max(snapshot?.content.length ?? 0, 1))}%` }} />
                  </div>
                  <span>{count}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="analytics-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Channels</span>
              <h2>Content mix</h2>
            </div>
            <span className="chart-total">{highestChannel?.[0] ? highestChannel[0] : "n/a"}</span>
          </div>
          <div className="chart-bars">
            {Object.entries(snapshot?.channelCounts ?? {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([channel, count]) => (
                <div key={channel} className="chart-row">
                  <label>{channel}</label>
                  <div className="chart-bar-shell">
                    <i style={{ width: `${percent(count, Math.max(snapshot?.content.length ?? 0, 1))}%` }} />
                  </div>
                  <span>{count}</span>
                </div>
              ))}
          </div>
        </Card>
      </section>

      <section className="analytics-grid analytics-grid-wide">
        <Card className="analytics-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Due soon</span>
              <h2>Content queue</h2>
            </div>
          </div>
          {snapshot?.dueSoon.length ? (
            <div className="queue-list">
              {snapshot.dueSoon.map((item) => (
                <div key={item.id} className="queue-row">
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.stage}</span>
                  </div>
                  <Badge variant="outline">{formatShortDate(item.dueDate)}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="table-empty">No upcoming deadlines found.</p>
          )}
        </Card>
      </section>
    </main>
  );
}
