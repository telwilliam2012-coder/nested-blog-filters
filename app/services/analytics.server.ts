import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { PrismaClient } from "@prisma/client";
import type { authenticate } from "../shopify.server";
import type { AppPlanAccess } from "../billing-plans";
import prisma from "../db.server";

const DAY_MS = 86_400_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BLOG_GID = /^gid:\/\/shopify\/Blog\/[1-9]\d*$/;
const MAX_BODY_BYTES = 1024;
const MAX_EVENTS_PER_DOCUMENT = 100;
const MAX_EVENTS_PER_SHOP_MINUTE = 3000;
const shopWindows = new Map<string, { minute: number; count: number }>();
const purgeTimes = new WeakMap<PrismaClient, number>();

type ProxyContext = Awaited<ReturnType<typeof authenticate.public.appProxy>>;
type ProxyAuthenticator = (
  request: Request,
) => Promise<Pick<ProxyContext, "session" | "admin">>;
type PlanResolver = (
  admin: NonNullable<ProxyContext["admin"]>,
  expectedShop: string,
) => Promise<Pick<AppPlanAccess, "analytics"> | null>;

type AnalyticsEventBase = {
  blogId: string;
  pageId: string;
  eventId: string;
  consent: true;
};
export type AnalyticsEvent = AnalyticsEventBase &
  (
    | { event: "view" | "search"; filterId?: never }
    | { event: "filter"; filterId?: string }
  );
export type AnalyticsCounts = {
  pageViews: number;
  filterInteractions: number;
  searchSubmissions: number;
};
export type AnalyticsReport = {
  range: { from: string; to: string; days: number };
  totals: AnalyticsCounts;
  daily: Array<AnalyticsCounts & { day: string }>;
  blogs: Array<AnalyticsCounts & { id: string; blogId: string; name: string }>;
  selectedFilterSetId: string | null;
  availableFrom: string | null;
  topFilters: Array<{
    filterId: string;
    filterKey: string;
    filterLabel: string;
    filterSetId: string;
    filterSetName: string;
    blogId: string;
    interactions: number;
  }>;
  filterUsageAvailableFrom: string | null;
};

export class AnalyticsInputError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AnalyticsInputError";
  }
}

function dayAt(date: Date, offset = 0) {
  return new Date(date.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
}
const emptyCounts = (): AnalyticsCounts => ({
  pageViews: 0,
  filterInteractions: 0,
  searchSubmissions: 0,
});
function addCounts(target: AnalyticsCounts, source: AnalyticsCounts) {
  target.pageViews += source.pageViews;
  target.filterInteractions += source.filterInteractions;
  target.searchSubmissions += source.searchSubmissions;
}

export function validAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const hasFilterId = Object.prototype.hasOwnProperty.call(event, "filterId");
  return (
    Object.keys(event).length === (hasFilterId ? 6 : 5) &&
    Object.keys(event).every((key) =>
      ["blogId", "pageId", "eventId", "event", "consent", "filterId"].includes(
        key,
      ),
    ) &&
    (!hasFilterId ||
      (event.event === "filter" &&
        typeof event.filterId === "string" &&
        /^[a-zA-Z0-9_-]{1,128}$/.test(event.filterId))) &&
    typeof event.blogId === "string" &&
    event.blogId.length <= 128 &&
    BLOG_GID.test(event.blogId) &&
    typeof event.pageId === "string" &&
    UUID.test(event.pageId) &&
    typeof event.eventId === "string" &&
    UUID.test(event.eventId) &&
    typeof event.event === "string" &&
    ["view", "filter", "search"].includes(event.event) &&
    event.consent === true
  );
}

function acceptsShopEvent(shop: string, now: Date) {
  const minute = Math.floor(now.getTime() / 60_000);
  if (shopWindows.size >= 1000) {
    for (const [key, value] of shopWindows) {
      if (value.minute !== minute) shopWindows.delete(key);
    }
    if (shopWindows.size >= 1000 && !shopWindows.has(shop)) return false;
  }
  const window = shopWindows.get(shop);
  if (!window || window.minute !== minute) {
    shopWindows.set(shop, { minute, count: 1 });
    return true;
  }
  if (window.count >= MAX_EVENTS_PER_SHOP_MINUTE) return false;
  window.count++;
  return true;
}

async function readEvent(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new AnalyticsInputError("Expected JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new AnalyticsInputError("Missing event.");
  let length = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new AnalyticsInputError("Event is too large.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new AnalyticsInputError("Invalid JSON.");
  }
}

export async function purgeExpiredAnalytics(
  db: PrismaClient = prisma,
  now = new Date(),
) {
  // Bound receipts and daily aggregates; runs on ingestion and reporting.
  await db.$transaction([
    db.analyticsReceipt.deleteMany({ where: { day: { lt: dayAt(now, -1) } } }),
    db.analyticsDaily.deleteMany({ where: { day: { lt: dayAt(now, -89) } } }),
    db.filterUsageDaily.deleteMany({ where: { day: { lt: dayAt(now, -89) } } }),
  ]);
}

async function maybePurgeExpiredAnalytics(db: PrismaClient, now: Date) {
  const previous = purgeTimes.get(db);
  if (
    previous !== undefined &&
    now.getTime() >= previous &&
    now.getTime() - previous < 3_600_000
  )
    return;
  await purgeExpiredAnalytics(db, now);
  purgeTimes.set(db, now.getTime());
}

export async function recordAnalyticsEvent(
  shop: string,
  event: AnalyticsEvent,
  db: PrismaClient = prisma,
  now = new Date(),
) {
  if (!validAnalyticsEvent(event))
    throw new AnalyticsInputError("Invalid event.");
  const filterSet = await db.filterSet.findUnique({
    where: { shop_blogId: { shop, blogId: event.blogId } },
    select: { id: true },
  });
  if (!filterSet) return "unconfigured" as const;
  const filterId = event.event === "filter" ? event.filterId : undefined;
  if (
    filterId &&
    !(await db.filter.findFirst({
      where: { id: filterId, filterSetId: filterSet.id },
      select: { id: true },
    }))
  )
    throw new AnalyticsInputError("Invalid filter.");
  const day = dayAt(now);
  const pageHash = createHash("sha256")
    .update(`${shop}|${filterSet.id}|${event.pageId}`)
    .digest("hex");
  const id = createHash("sha256")
    .update(
      `${pageHash}|${event.event}|${event.event === "view" ? "view" : event.eventId}`,
    )
    .digest("hex");
  const metric = {
    view: "pageViews",
    filter: "filterInteractions",
    search: "searchSubmissions",
  }[event.event];
  await maybePurgeExpiredAnalytics(db, now);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          if (
            await tx.analyticsReceipt.findUnique({
              where: { id },
              select: { id: true },
            })
          )
            return "duplicate" as const;
          if (
            (await tx.analyticsReceipt.count({
              where: { filterSetId: filterSet.id, pageHash, day },
            })) >= MAX_EVENTS_PER_DOCUMENT
          )
            return "limited" as const;
          await tx.analyticsReceipt.create({
            data: {
              id,
              filterSetId: filterSet.id,
              pageHash,
              day,
              kind: event.event,
            },
          });
          await tx.analyticsDaily.upsert({
            where: { filterSetId_day: { filterSetId: filterSet.id, day } },
            create: { filterSetId: filterSet.id, day, [metric]: 1 },
            update: { [metric]: { increment: 1 } },
          });
          if (filterId) {
            await tx.filterUsageDaily.upsert({
              where: { filterId_day: { filterId, day } },
              create: {
                filterId,
                filterSetId: filterSet.id,
                day,
                interactions: 1,
              },
              update: { interactions: { increment: 1 } },
            });
          }
          return "recorded" as const;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "P2002") {
        // A concurrent first event can race on the daily row rather than on
        // this receipt. Only a committed matching receipt means duplication.
        if (
          await db.analyticsReceipt.findUnique({
            where: { id },
            select: { id: true },
          })
        )
          return "duplicate" as const;
      }
      if ((code === "P2002" || code === "P2034") && attempt < 4) {
        await delay(5 * 2 ** attempt);
        continue;
      }
      throw error;
    }
  }
  return "limited" as const;
}

export async function handleAnalyticsRequest(
  request: Request,
  authenticateProxy: ProxyAuthenticator,
  resolvePlan: PlanResolver,
  db: PrismaClient = prisma,
  now = new Date(),
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (request.method !== "POST")
    return new Response(null, {
      status: 405,
      headers: { ...headers, Allow: "POST" },
    });
  let context: Awaited<ReturnType<ProxyAuthenticator>>;
  try {
    context = await authenticateProxy(request);
  } catch {
    return new Response(null, { status: 401, headers });
  }
  if (!context.session || !context.admin)
    return new Response(null, { status: 401, headers });
  if (!acceptsShopEvent(context.session.shop, now))
    return new Response(null, { status: 204, headers });
  try {
    const access = await resolvePlan(context.admin, context.session.shop);
    if (!access?.analytics) return new Response(null, { status: 204, headers });
    const event = await readEvent(request);
    if (!validAnalyticsEvent(event))
      throw new AnalyticsInputError("Invalid event.");
    await recordAnalyticsEvent(context.session.shop, event, db, now);
    return new Response(null, { status: 204, headers });
  } catch (error) {
    return new Response(null, {
      status: error instanceof AnalyticsInputError ? error.status : 503,
      headers,
    });
  }
}

export async function getAnalyticsReport(
  shop: string,
  { days = 30, filterSetId }: { days?: number; filterSetId?: string } = {},
  db: PrismaClient = prisma,
  now = new Date(),
): Promise<AnalyticsReport> {
  if (![7, 30, 90].includes(days))
    throw new AnalyticsInputError("Invalid period.");
  const filterSets = await db.filterSet.findMany({
    where: { shop },
    select: { id: true, name: true, blogId: true },
    orderBy: { name: "asc" },
  });
  if (filterSetId && !filterSets.some((set) => set.id === filterSetId))
    throw new AnalyticsInputError("Filter set not found.", 404);
  await purgeExpiredAnalytics(db, now);
  const from = dayAt(now, 1 - days);
  const to = dayAt(now);
  const rows = await db.analyticsDaily.findMany({
    where: { filterSet: { shop }, day: { gte: from, lte: to } },
  });
  const first = await db.analyticsDaily.findFirst({
    where: { filterSet: { shop }, ...(filterSetId ? { filterSetId } : {}) },
    orderBy: { day: "asc" },
    select: { day: true },
  });
  const rankingScope = {
    filter: { filterSet: { shop } },
    ...(filterSetId ? { filterSetId } : {}),
  };
  const ranked = await db.filterUsageDaily.groupBy({
    by: ["filterId", "filterSetId"],
    where: { ...rankingScope, day: { gte: from, lte: to } },
    _sum: { interactions: true },
    orderBy: [{ _sum: { interactions: "desc" } }, { filterId: "asc" }],
    take: 10,
  });
  const rankedFilters = await db.filter.findMany({
    where: {
      id: { in: ranked.map((row) => row.filterId) },
      filterSet: { shop },
    },
    select: {
      id: true,
      key: true,
      label: true,
      filterSetId: true,
      filterSet: { select: { name: true, blogId: true } },
    },
  });
  const filterMetadata = new Map(
    rankedFilters.map((filter) => [filter.id, filter]),
  );
  const topFilters = ranked.flatMap((row) => {
    const filter = filterMetadata.get(row.filterId);
    return filter
      ? [
          {
            filterId: filter.id,
            filterKey: filter.key,
            filterLabel: filter.label,
            filterSetId: filter.filterSetId,
            filterSetName: filter.filterSet.name,
            blogId: filter.filterSet.blogId,
            interactions: row._sum.interactions ?? 0,
          },
        ]
      : [];
  });
  const firstUsage = await db.filterUsageDaily.findFirst({
    where: rankingScope,
    orderBy: { day: "asc" },
    select: { day: true },
  });
  const daily = Array.from({ length: days }, (_, index) => ({
    day: dayAt(now, 1 - days + index),
    ...emptyCounts(),
  }));
  const byDay = new Map(daily.map((day) => [day.day, day]));
  const blogs = filterSets.map((set) => ({ ...set, ...emptyCounts() }));
  const byBlog = new Map(blogs.map((blog) => [blog.id, blog]));
  const totals = emptyCounts();
  for (const row of rows) {
    const blog = byBlog.get(row.filterSetId);
    if (blog) addCounts(blog, row);
    if (filterSetId && row.filterSetId !== filterSetId) continue;
    const day = byDay.get(row.day);
    if (day) addCounts(day, row);
    addCounts(totals, row);
  }
  return {
    range: { from, to, days },
    totals,
    daily,
    blogs,
    selectedFilterSetId: filterSetId || null,
    availableFrom: first?.day ?? null,
    topFilters,
    filterUsageAvailableFrom: firstUsage?.day ?? null,
  };
}
