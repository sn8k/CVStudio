import { prisma } from "@/lib/prisma";
import { isKnownRobot } from "@/lib/ai-crawlers";

const parisDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

let lastRetentionRunDate: string | null = null;

export function parisDateKey(date = new Date()) {
  const parts = parisDateFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function daysBefore(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

function monthsBefore(dateKey: string, months: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const monthIndex = year * 12 + month - 1 - months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function getNextParisDayBoundary(date = new Date()) {
  const currentDay = parisDateKey(date);
  let low = date.getTime();
  let high = low + 30 * 60 * 60 * 1000;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (parisDateKey(new Date(middle)) === currentDay) low = middle;
    else high = middle;
  }
  return new Date(high);
}

export function getAudienceRetentionCutoff(date = new Date()) {
  return monthsBefore(parisDateKey(date), 25);
}

export async function purgeExpiredAudienceStats(date = new Date()) {
  const today = parisDateKey(date);
  if (lastRetentionRunDate === today) return false;
  lastRetentionRunDate = today;
  try {
    await prisma.dailyPageView.deleteMany({ where: { date: { lt: getAudienceRetentionCutoff(date) } } });
    return true;
  } catch (error) {
    lastRetentionRunDate = null;
    console.error("Impossible de purger les statistiques d’audience expirées.", error);
    return false;
  }
}

export function resetAudienceRetentionGuardForTests() {
  lastRetentionRunDate = null;
}

export async function recordPublicPageView(userAgent: string, now = new Date()) {
  if (isKnownRobot(userAgent)) return false;
  const date = parisDateKey(now);
  try {
    await purgeExpiredAudienceStats(now);
    await prisma.dailyPageView.upsert({
      where: { date },
      update: { views: { increment: 1 } },
      create: { date, views: 1 },
    });
    return true;
  } catch (error) {
    console.error("Impossible d’enregistrer la vue publique.", error);
    return false;
  }
}

export async function recordDailyUniqueVisit(userAgent: string, now = new Date()) {
  if (isKnownRobot(userAgent)) return false;
  const date = parisDateKey(now);
  try {
    await purgeExpiredAudienceStats(now);
    await prisma.dailyPageView.upsert({
      where: { date },
      update: { uniqueVisitors: { increment: 1 } },
      create: { date, uniqueVisitors: 1 },
    });
    return true;
  } catch (error) {
    console.error("Impossible d’enregistrer le navigateur quotidien.", error);
    return false;
  }
}

export async function getVisitStats() {
  await purgeExpiredAudienceStats();
  const todayKey = parisDateKey();
  const rows = await prisma.dailyPageView.findMany({ orderBy: { date: "asc" } });
  const recentMap = new Map(rows.map((row) => [row.date, row]));
  const sumSince = (date: string, field: "views" | "uniqueVisitors") => rows.filter((row) => row.date >= date && row.date <= todayKey).reduce((sum, row) => sum + row[field], 0);
  const recent = Array.from({ length: 14 }, (_, index) => {
    const date = daysBefore(todayKey, 13 - index);
    const row = recentMap.get(date);
    return { date, views: row?.views ?? 0, uniqueVisitors: row?.uniqueVisitors ?? 0 };
  });
  const uniqueLast7Days = sumSince(daysBefore(todayKey, 6), "uniqueVisitors");
  const uniqueLast30Days = sumSince(daysBefore(todayKey, 29), "uniqueVisitors");
  return {
    total: rows.reduce((sum, row) => sum + row.views, 0),
    today: recentMap.get(todayKey)?.views ?? 0,
    last7Days: sumSince(daysBefore(todayKey, 6), "views"),
    last30Days: sumSince(daysBefore(todayKey, 29), "views"),
    uniqueToday: recentMap.get(todayKey)?.uniqueVisitors ?? 0,
    uniqueDailyAverage7Days: Number((uniqueLast7Days / 7).toFixed(1)),
    uniqueDailyAverage30Days: Number((uniqueLast30Days / 30).toFixed(1)),
    recent,
  };
}
