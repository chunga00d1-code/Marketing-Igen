import { randomUUID } from "node:crypto";
import { FacebookAutoReplyJobModel } from "../model/facebook-auto-reply-job.model";

export const FACEBOOK_REPLY_MAX_ATTEMPTS = 8;
export const FACEBOOK_REPLY_LEASE_MS = 300_000;
export const FACEBOOK_REPLY_RETRY_BASE_MS = 30_000;

export function requireFacebookReplyText(text: unknown) {
  if (typeof text !== "string" || !text.trim()) throw new Error("AI returned an empty Facebook reply.");
}

export function facebookReplyOutcome(attempts: number, sendingStarted: boolean, error?: unknown) {
  const failed = error !== undefined;
  return {
    status: failed ? (sendingStarted || attempts >= FACEBOOK_REPLY_MAX_ATTEMPTS ? "failed" as const : "pending" as const) : "completed" as const,
    backoffMs: Math.min(3_600_000, FACEBOOK_REPLY_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1)),
  };
}

type IncomingJob = {
  conversationId: string; pageId: string; companyCode: string; messageId: string;
  messageTimestamp: Date; messageCreatedAt: Date; text: string; nextAttemptAt: Date;
};

/** Duplicate triggers never rewrite a lease, delivery marker, attempt count or due time. */
export async function enqueueFacebookReply(input: IncomingJob) {
  await FacebookAutoReplyJobModel.init();
  const key = { channel: "facebook" as const, conversationId: input.conversationId };
  // Insert only. A concurrent insert cannot reset the winner's state.
  try {
    await FacebookAutoReplyJobModel.updateOne(key, {
      $setOnInsert: { ...input, channel: "facebook", status: "pending", attempts: 0 },
    }, { upsert: true });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  await FacebookAutoReplyJobModel.updateOne({
    ...key, messageId: { $ne: input.messageId },
    $and: [
      { $or: [
        { messageTimestamp: { $lt: input.messageTimestamp } },
        { messageTimestamp: input.messageTimestamp, messageCreatedAt: { $lt: input.messageCreatedAt } },
        { messageTimestamp: { $exists: false } },
      ] },
      // Preserve a failed turn until its staff handoff has been persisted.
      { $or: [{ status: { $ne: "failed" } }, { failureNotifiedAt: { $exists: true } }] },
    ],
  }, {
    $set: { ...input, status: "pending", attempts: 0, lastError: "" },
    $unset: { leaseToken: 1, leaseUntil: 1, completedAt: 1, deliveryStartedAt: 1, failureNotifiedAt: 1 },
  });
  const job = await FacebookAutoReplyJobModel.findOne(key).lean();
  if (!job || job.messageId !== input.messageId || job.attempts >= FACEBOOK_REPLY_MAX_ATTEMPTS) return null;
  if (job.status === "pending") return job.nextAttemptAt;
  if (job.status === "processing" && !job.deliveryStartedAt && job.leaseUntil && job.leaseUntil <= new Date()) {
    return new Date();
  }
  return null;
}

export async function claimFacebookReply(conversationId: string, messageId: string) {
  const now = new Date();
  const leaseToken = randomUUID();
  const job = await FacebookAutoReplyJobModel.findOneAndUpdate({
    channel: "facebook", conversationId, messageId, attempts: { $lt: FACEBOOK_REPLY_MAX_ATTEMPTS },
    deliveryStartedAt: { $exists: false },
    $or: [
      { status: "pending", nextAttemptAt: { $lte: now } },
      { status: "processing", leaseUntil: { $lte: now } },
    ],
  }, { $set: { status: "processing", leaseToken, leaseUntil: new Date(now.getTime() + FACEBOOK_REPLY_LEASE_MS) },
    $inc: { attempts: 1 } }, { new: true });
  return job ? { job, leaseToken } : null;
}

export function facebookReplyLease(conversationId: string, messageId: string, leaseToken: string) {
  return { channel: "facebook" as const, conversationId, messageId, status: "processing" as const, leaseToken,
    leaseUntil: { $gt: new Date() } };
}

export async function markFacebookReplySending(conversationId: string, messageId: string, leaseToken: string) {
  const result = await FacebookAutoReplyJobModel.updateOne(facebookReplyLease(conversationId, messageId, leaseToken),
    { $set: { deliveryStartedAt: new Date() } });
  return result.matchedCount > 0;
}

export async function expireFacebookReplyJobs(now = new Date()) {
  await FacebookAutoReplyJobModel.updateMany({
    channel: "facebook", status: "processing", deliveryStartedAt: { $exists: true }, leaseUntil: { $lte: now },
  }, { $set: { status: "failed", lastError: "Delivery was interrupted after a Facebook send began; staff must check the conversation before replying." },
    $unset: { leaseToken: 1, leaseUntil: 1 } });
  await FacebookAutoReplyJobModel.updateMany({
    channel: "facebook", attempts: { $gte: FACEBOOK_REPLY_MAX_ATTEMPTS },
    $or: [
      { status: "pending", nextAttemptAt: { $lte: now } },
      { status: "processing", leaseUntil: { $lte: now } },
    ],
  }, { $set: { status: "failed", lastError: "Maximum retry count reached or worker stopped before completion." },
    $unset: { leaseToken: 1, leaseUntil: 1 } });
}
