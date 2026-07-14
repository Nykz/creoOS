import { z } from "zod";

const title = z.string().trim().min(1).max(160);

export type ResourceKey = keyof typeof resources;

export type ResourceColumn = {
  key: string;
  label: string;
  kind?: "text" | "status" | "number" | "currency" | "date" | "progress";
};

export type ResourceField = {
  name: string;
  label: string;
  kind?: "text" | "number" | "date" | "select";
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
  optionsSource?: "members" | "content";
};

export type ResourceConfig = {
  table: string;
  label: string;
  schema: z.ZodTypeAny;
  columns: ResourceColumn[];
  fields: ResourceField[];
  searchFields: string[];
  defaultOrderBy: { column: string; ascending: boolean };
  defaultValues?: Record<string, string>;
};

const statusOptions = [
  { label: "Idea", value: "idea" },
  { label: "Script", value: "script" },
  { label: "Editing", value: "editing" },
  { label: "Review", value: "review" },
  { label: "Published", value: "published" },
];

const contentChannelOptions = [
  { label: "YouTube", value: "youtube" },
  { label: "Instagram", value: "instagram" },
  { label: "LinkedIn", value: "linkedin" },
  { label: "Shorts", value: "shorts" },
  { label: "Reels", value: "reels" },
  { label: "Newsletter", value: "newsletter" },
  { label: "Course", value: "course" },
];

const taskStatusOptions = [
  { label: "Todo", value: "todo" },
  { label: "In progress", value: "in_progress" },
  { label: "Done", value: "done" },
];

const taskPriorityOptions = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

const courseStatusOptions = [
  { label: "Draft", value: "draft" },
  { label: "Planning", value: "planning" },
  { label: "Published", value: "published" },
  { label: "Archived", value: "archived" },
];

const sponsorStatusOptions = [
  { label: "Lead", value: "lead" },
  { label: "Negotiating", value: "negotiating" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
  { label: "Lost", value: "lost" },
];

const affiliateStatusOptions = [
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Archived", value: "archived" },
];

export const resources = {
  content: {
    table: "content_items",
    label: "content item",
    schema: z.object({
      title,
      channel: z.enum(["youtube", "instagram", "linkedin", "shorts", "reels", "newsletter", "course"]),
      stage: z.enum(["idea", "script", "editing", "review", "published"]).default("idea"),
      progress: z.number().int().min(0).max(100).default(0),
      due_date: z.string().nullable().optional(),
    }),
    columns: [
      { key: "title", label: "Title" },
      { key: "channel", label: "Channel" },
      { key: "stage", label: "Stage", kind: "status" },
      { key: "progress", label: "Progress", kind: "progress" },
      { key: "due_date", label: "Due", kind: "date" },
    ],
    fields: [
      { name: "title", label: "Title", placeholder: "Launch trailer", required: true },
      { name: "channel", label: "Channel", kind: "select", options: contentChannelOptions, required: true },
      { name: "stage", label: "Stage", kind: "select", options: statusOptions, required: true },
      { name: "progress", label: "Progress", kind: "number", min: 0, max: 100, step: 1, required: true },
      { name: "due_date", label: "Due date", kind: "date" },
    ],
    searchFields: ["title", "channel", "stage"],
    defaultOrderBy: { column: "created_at", ascending: false },
    defaultValues: { stage: "idea", progress: "10" },
  },
  tasks: {
    table: "tasks",
    label: "task",
    schema: z.object({
      title,
      status: z.enum(["todo", "in_progress", "done"]).default("todo"),
      priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
      due_date: z.string().nullable().optional(),
      assignee_id: z.string().uuid().nullable().optional(),
      content_item_id: z.string().uuid().nullable().optional(),
    }),
    columns: [
      { key: "title", label: "Title" },
      { key: "status", label: "Status", kind: "status" },
      { key: "priority", label: "Priority", kind: "status" },
      { key: "assignee_label", label: "Assignee" },
      { key: "content_item_label", label: "Content" },
      { key: "due_date", label: "Due", kind: "date" },
    ],
    fields: [
      { name: "title", label: "Title", placeholder: "Prepare sponsor deck", required: true },
      { name: "status", label: "Status", kind: "select", options: taskStatusOptions, required: true },
      { name: "priority", label: "Priority", kind: "select", options: taskPriorityOptions, required: true },
      { name: "assignee_id", label: "Assignee", kind: "select", optionsSource: "members" },
      { name: "content_item_id", label: "Related content", kind: "select", optionsSource: "content" },
      { name: "due_date", label: "Due date", kind: "date" },
    ],
    searchFields: ["title", "status", "priority", "assignee_label", "content_item_label"],
    defaultOrderBy: { column: "created_at", ascending: false },
    defaultValues: { status: "todo", priority: "medium" },
  },
  courses: {
    table: "courses",
    label: "course",
    schema: z.object({
      title,
      status: z.enum(["draft", "planning", "published", "archived"]).default("draft"),
      launch_date: z.string().nullable().optional(),
    }),
    columns: [
      { key: "title", label: "Title" },
      { key: "status", label: "Status", kind: "status" },
      { key: "launch_date", label: "Launch", kind: "date" },
    ],
    fields: [
      { name: "title", label: "Title", placeholder: "Creator business 101", required: true },
      { name: "status", label: "Status", kind: "select", options: courseStatusOptions, required: true },
      { name: "launch_date", label: "Launch date", kind: "date" },
    ],
    searchFields: ["title", "status"],
    defaultOrderBy: { column: "created_at", ascending: false },
    defaultValues: { status: "draft" },
  },
  sponsors: {
    table: "sponsorships",
    label: "sponsor",
    schema: z.object({
      name: title,
      status: z.enum(["lead", "negotiating", "active", "completed", "lost"]).default("lead"),
      amount: z.number().nonnegative().default(0),
      currency: z.string().trim().length(3).toUpperCase().default("USD"),
      deliverable_due_date: z.string().nullable().optional(),
    }),
    columns: [
      { key: "name", label: "Company" },
      { key: "status", label: "Status", kind: "status" },
      { key: "amount", label: "Value", kind: "currency" },
      { key: "currency", label: "Currency" },
      { key: "deliverable_due_date", label: "Deliverable due", kind: "date" },
    ],
    fields: [
      { name: "name", label: "Company", placeholder: "Acme Media", required: true },
      { name: "status", label: "Status", kind: "select", options: sponsorStatusOptions, required: true },
      { name: "amount", label: "Value", kind: "number", min: 0, step: 1, required: true },
      { name: "currency", label: "Currency", placeholder: "USD", required: true },
      { name: "deliverable_due_date", label: "Deliverable due", kind: "date" },
    ],
    searchFields: ["name", "status", "currency"],
    defaultOrderBy: { column: "created_at", ascending: false },
    defaultValues: { status: "lead", amount: "0", currency: "USD" },
  },
  affiliates: {
    table: "affiliates",
    label: "affiliate partner",
    schema: z.object({
      name: title,
      platform: z.string().trim().min(1).max(80),
      status: z.enum(["active", "paused", "archived"]).default("active"),
      commission_rate: z.number().min(0).max(100).default(0),
    }),
    columns: [
      { key: "name", label: "Partner" },
      { key: "platform", label: "Platform" },
      { key: "status", label: "Status", kind: "status" },
      { key: "commission_rate", label: "Commission", kind: "number" },
    ],
    fields: [
      { name: "name", label: "Partner", placeholder: "Creator Hub", required: true },
      { name: "platform", label: "Platform", placeholder: "YouTube", required: true },
      { name: "status", label: "Status", kind: "select", options: affiliateStatusOptions, required: true },
      { name: "commission_rate", label: "Commission rate", kind: "number", min: 0, max: 100, step: 0.1, required: true },
    ],
    searchFields: ["name", "platform", "status"],
    defaultOrderBy: { column: "created_at", ascending: false },
    defaultValues: { status: "active", commission_rate: "0" },
  },
} as const satisfies Record<string, ResourceConfig>;

export function isResourceKey(value: string): value is ResourceKey {
  return value in resources;
}
