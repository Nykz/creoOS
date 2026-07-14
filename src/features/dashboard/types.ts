export type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
  trend: number;
};

export type ContentItem = {
  id: string;
  title: string;
  channel: string;
  stage: string;
  progress: number;
  dueDate: string | null;
};

export type DashboardData = {
  metrics: DashboardMetric[];
  content: ContentItem[];
  stageCounts: Record<string, number>;
  taskCounts: Record<string, number>;
  sponsorCounts: Record<string, number>;
  channelCounts: Record<string, number>;
  progressBands: Record<string, number>;
  source: "live" | "unavailable";
  message?: string;
};
