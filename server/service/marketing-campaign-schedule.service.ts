import { MarketingCampaignPlatform } from "../interface/marketing-campaign.interface";

export interface CampaignScheduleSlotInput {
  scheduledAt: Date;
  prepareAt: Date;
  verifyAt: Date;
  platform: MarketingCampaignPlatform;
  slotIndex: number;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function readZonedParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const mapped = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(mapped.year),
    month: Number(mapped.month),
    day: Number(mapped.day),
    hour: Number(mapped.hour),
    minute: Number(mapped.minute),
    second: Number(mapped.second),
  };
}

export function zonedLocalTimeToUtc(date: string, time: string, timezone: string): Date {
  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) {
    throw new Error("Ngày hoặc giờ chiến dịch không đúng định dạng.");
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error("Múi giờ chiến dịch không hợp lệ.");
  }

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const intendedUtcValue = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(intendedUtcValue);

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = readZonedParts(candidate, timezone);
    const representedUtcValue = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate = new Date(candidate.getTime() + intendedUtcValue - representedUtcValue);
  }

  const verified = readZonedParts(candidate, timezone);
  if (verified.year !== year || verified.month !== month || verified.day !== day || verified.hour !== hour || verified.minute !== minute) {
    throw new Error(`Thời gian ${date} ${time} không tồn tại trong múi giờ ${timezone}.`);
  }
  return candidate;
}

function enumerateDates(startDate: string, endDate: string): string[] {
  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
    throw new Error("Khoảng ngày chiến dịch không đúng định dạng.");
  }
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
    throw new Error("Khoảng ngày chiến dịch không hợp lệ.");
  }

  const dates: string[] = [];
  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += 86400000) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
}

export function buildCampaignSchedule(input: {
  startDate: string;
  endDate: string;
  postsPerDay: number;
  postingTimes: string[];
  timezone: string;
  platforms: MarketingCampaignPlatform[];
  generationLeadMinutes: number;
  verificationLeadMinutes: number;
}): CampaignScheduleSlotInput[] {
  const dates = enumerateDates(input.startDate, input.endDate);
  if (dates.length > 31) throw new Error("Mỗi chiến dịch tối đa 31 ngày.");
  if (!Number.isInteger(input.postsPerDay) || input.postsPerDay < 1 || input.postsPerDay > 5) {
    throw new Error("Số bài mỗi ngày phải từ 1 đến 5.");
  }
  if (input.postingTimes.length !== input.postsPerDay || input.postingTimes.some((time) => !TIME_PATTERN.test(time))) {
    throw new Error("Mỗi bài trong ngày phải có một khung giờ hợp lệ.");
  }
  if (new Set(input.postingTimes).size !== input.postingTimes.length) {
    throw new Error("Các khung giờ đăng trong ngày không được trùng nhau.");
  }
  if (input.platforms.length === 0) throw new Error("Chiến dịch phải có ít nhất một nền tảng.");

  const totalSlots = dates.length * input.postsPerDay;
  if (totalSlots > 60) throw new Error("Mỗi chiến dịch tối đa 60 lượt đăng.");

  return dates.flatMap((date, dayIndex) => input.postingTimes.map((time, timeIndex) => {
    const slotIndex = dayIndex * input.postsPerDay + timeIndex;
    const scheduledAt = zonedLocalTimeToUtc(date, time, input.timezone);
    return {
      scheduledAt,
      prepareAt: new Date(scheduledAt.getTime() - input.generationLeadMinutes * 60000),
      verifyAt: new Date(scheduledAt.getTime() - input.verificationLeadMinutes * 60000),
      platform: input.platforms[slotIndex % input.platforms.length],
      slotIndex,
    };
  }));
}
