import "server-only";
import { getInsforgeAdmin } from "@/lib/insforge/server";
import type { ContentItem, DashboardData } from "./types";

const stages = ["idea", "script", "editing", "review", "published"];
const progressBands = [
  { label: "0-20", min: 0, max: 20 },
  { label: "21-40", min: 21, max: 40 },
  { label: "41-60", min: 41, max: 60 },
  { label: "61-80", min: 61, max: 80 },
  { label: "81-100", min: 81, max: 100 },
];

type ContentRow = {
  id: string;
  title: string;
  channel: string | null;
  stage: string | null;
  progress: number | null;
  due_date: string | null;
};

/**
 * Backend access stays here so future schema changes are contained to one module.
 * Tables are deliberately queried without seed fallbacks: the UI must only show real data.
 */
export async function getDashboardData(): Promise<DashboardData> {
  try {
    const client = getInsforgeAdmin();
    const [contentResult, tasksResult, sponsorsResult, coursesResult] = await Promise.all([
      client.database.from("content_items").select("id,title,channel,stage,progress,due_date").order("due_date", { ascending: true }).limit(8),
      client.database.from("tasks").select("status").limit(500),
      client.database.from("sponsorships").select("amount,status").limit(500),
      client.database.from("courses").select("id", { count: "exact", head: true }).eq("status", "published"),
    ]);

    if (contentResult.error || tasksResult.error || sponsorsResult.error || coursesResult.error) {
      throw new Error(contentResult.error?.message || tasksResult.error?.message || sponsorsResult.error?.message || coursesResult.error?.message || "Unable to load workspace data.");
    }

    const content = ((contentResult.data ?? []) as ContentRow[]).map<ContentItem>((item) => ({
      id: item.id,
      title: item.title,
      channel: item.channel ?? "Unassigned",
      stage: item.stage ?? "idea",
      progress: Number(item.progress ?? 0),
      dueDate: item.due_date,
    }));
    const stageCounts = Object.fromEntries(stages.map((stage) => [stage, content.filter((item) => item.stage === stage).length]));
    const taskCounts = Object.fromEntries(["todo", "in_progress", "done"].map((status) => [status, (tasksResult.data ?? []).filter((item) => item.status === status).length]));
    const sponsorCounts = Object.fromEntries(["lead", "negotiating", "active", "completed", "lost"].map((status) => [status, (sponsorsResult.data ?? []).filter((item) => item.status === status).length]));
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
    const pipelineValue = ((sponsorsResult.data ?? []) as Array<{ amount: number | null }>).reduce((total, deal) => total + Number(deal.amount ?? 0), 0);

    return {
      source: "live",
      content,
      stageCounts,
      taskCounts,
      sponsorCounts,
      channelCounts,
      progressBands: progressBandCounts,
      metrics: [
        { label: "Published this month", value: String(stageCounts.published), detail: "From your content pipeline", trend: 0 },
        { label: "Tasks completed", value: String(taskCounts.done ?? 0), detail: "Completed tasks", trend: 0 },
        { label: "Revenue in pipeline", value: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(pipelineValue), detail: "Active sponsor opportunities", trend: 0 },
        { label: "Published courses", value: String(coursesResult.count ?? 0), detail: "Courses currently live", trend: 0 },
      ],
    };
  } catch (error) {
    return {
      source: "unavailable",
      metrics: [],
      content: [],
      stageCounts: Object.fromEntries(stages.map((stage) => [stage, 0])),
      taskCounts: Object.fromEntries(["todo", "in_progress", "done"].map((stage) => [stage, 0])),
      sponsorCounts: Object.fromEntries(["lead", "negotiating", "active", "completed", "lost"].map((stage) => [stage, 0])),
      channelCounts: {},
      progressBands: Object.fromEntries(progressBands.map((band) => [band.label, 0])),
      message: error instanceof Error ? error.message : "InsForge data is unavailable.",
    };
  }
}
