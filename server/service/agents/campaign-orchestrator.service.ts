import { createHash } from "crypto";
import { MarketingCampaignModel } from "../../model/marketing-campaign.model";
import { MarketingCampaignSlotModel } from "../../model/marketing-campaign-slot.model";
import { MarketingContentModel } from "../../model/marketing-content.model";
import { ResearcherAgentService } from "./researcher-agent.service";
import { CopywriterAgentService } from "./copywriter-agent.service";
import { MediaCreatorAgentService } from "./media-creator-agent.service";
import { QcAgentService } from "./qc-agent.service";
import { PublisherAgentService } from "./publisher-agent.service";
import { releaseWithFailure } from "./campaign-utils";
import { cloudinaryService } from "../cloudinary.service";
import { API_COSTS, walletService } from "../wallet.service";
import { VisualAnalystAgentService } from "./visual-analyst-agent.service";
import { approvalNotifierService } from "../approval-notifier.service";
import { applyCampaignVideoCaption } from "./campaign-caption.service";
import { broadcastEvent } from "../../socket";
import { campaignContentSheetService } from "../campaign-content-sheet.service";

function emitSlotUpdate(slot: { _id: unknown; campaignId: unknown; companyCode: string; status: string }, extra?: Record<string, unknown>) {
  try {
    broadcastEvent("campaign:slot-update", {
      slotId: String(slot._id),
      campaignId: String(slot.campaignId),
      companyCode: slot.companyCode,
      status: slot.status,
      updatedAt: new Date().toISOString(),
      ...extra,
    });
  } catch (e) {
    console.warn("[Orchestrator] Socket broadcast failed:", e);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await handler(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function ingestRealMedia(
  slot: InstanceType<typeof MarketingCampaignSlotModel>,
  campaign: InstanceType<typeof MarketingCampaignModel>
): Promise<string[]> {
  const sourceUrls = (slot.realImageDirectUrls || []).filter(Boolean);
  if (sourceUrls.length === 0) {
    throw new Error("Slot ảnh thật không có media Google Drive để xử lý.");
  }

  const fingerprint = createHash("sha256").update(JSON.stringify(sourceUrls)).digest("hex");
  if (
    slot.mediaIngestionFingerprint === fingerprint &&
    slot.ingestedMedia?.length === sourceUrls.length
  ) {
    return slot.ingestedMedia.map((item) => item.url);
  }

  const uploadedAt = new Date();
  const ingestedMedia = await mapWithConcurrency(sourceUrls, 3, async (sourceUrl) => ({
    sourceUrl,
    url: await cloudinaryService.uploadMedia(sourceUrl, `campaign_${campaign._id}`),
    uploadedAt,
  }));

  slot.mediaIngestionFingerprint = fingerprint;
  slot.ingestedMedia = ingestedMedia;
  slot.transitions.push({
    from: slot.status,
    to: slot.status,
    reason: `Đã ingest ${ingestedMedia.length} media thật lên Cloudinary để dùng chung cho Vision và xuất bản.`,
    at: new Date(),
  });
  await slot.save();
  return ingestedMedia.map((item) => item.url);
}

async function billCampaignOperation(
  campaign: InstanceType<typeof MarketingCampaignModel>,
  slot: InstanceType<typeof MarketingCampaignSlotModel>,
  operation: string,
  amount: number,
  description: string
): Promise<void> {
  const result = await walletService.deductBalance(
    campaign.createdBy,
    amount,
    description,
    `${campaign._id}:${slot._id}:${operation}`
  );
  if (result?.charged) {
    await MarketingCampaignModel.updateOne(
      { _id: campaign._id, companyCode: campaign.companyCode },
      { $inc: { "statistics.actualCost": amount } }
    );
  }
}

async function getResearchContext(
  slot: InstanceType<typeof MarketingCampaignSlotModel>,
  campaign: InstanceType<typeof MarketingCampaignModel>
): Promise<string> {
  const fingerprint = ResearcherAgentService.fingerprint(slot, campaign);
  let analysis = slot.researchAnalysis;

  if (!analysis || analysis.fingerprint !== fingerprint) {
    await walletService.checkBalance(campaign.createdBy, API_COSTS.CAMPAIGN_RESEARCH);
    analysis = await ResearcherAgentService.research(slot, campaign);
    slot.researchAnalysis = analysis;
    slot.transitions.push({
      from: slot.status,
      to: slot.status,
      reason: `Researcher Agent đã hoàn tất nghiên cứu web cho slot bằng ${analysis.model}.`,
      at: new Date(),
    });
    await slot.save();
  }

  if (!analysis.billedAt) {
    await billCampaignOperation(
      campaign,
      slot,
      `research:${analysis.fingerprint}`,
      analysis.cost,
      `Researcher Agent for campaign slot ${slot._id}`
    );
    analysis.billedAt = new Date();
    slot.researchAnalysis = analysis;
    await slot.save();
  }

  return analysis.context;
}

async function getVisualContext(
  slot: InstanceType<typeof MarketingCampaignSlotModel>,
  campaign: InstanceType<typeof MarketingCampaignModel>
): Promise<string> {
  const fingerprint = VisualAnalystAgentService.fingerprint(slot, campaign);
  let analysis = slot.visualAnalysis;

  if (!analysis || analysis.fingerprint !== fingerprint) {
    const imageCount = slot.ingestedMedia?.length || slot.realImageDirectUrls?.length || 0;
    const expectedCost = API_COSTS.CAMPAIGN_VISION * Math.ceil(imageCount / 8);
    await walletService.checkBalance(campaign.createdBy, expectedCost);
    analysis = await VisualAnalystAgentService.analyze(slot, campaign);
    slot.visualAnalysis = analysis;
    slot.transitions.push({
      from: slot.status,
      to: slot.status,
      reason: `Vision Agent đã phân tích ${analysis.sourceUrls.length} ảnh thật của slot bằng ${analysis.model}.`,
      at: new Date(),
    });
    await slot.save();
  }

  if (!analysis.billedAt) {
    await billCampaignOperation(
      campaign,
      slot,
      `vision:${analysis.fingerprint}`,
      analysis.cost,
      `Phân tích ảnh thật cho slot chiến dịch ${slot._id} (Vision Analyst Agent)`
    );
    analysis.billedAt = new Date();
    slot.visualAnalysis = analysis;
    await slot.save();
  }

  return VisualAnalystAgentService.formatForCopywriter(analysis);
}

export class CampaignOrchestratorService {
  /**
   * Pipeline 1: Prepare Slot Content (Researcher Agent + Copywriter Agent)
   */
  public static async orchestratePrepare(slotId: string, lockId: string): Promise<void> {
    const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, lockId, status: "generating" });
    if (!slot) return;

    const campaign = await MarketingCampaignModel.findOne({
      _id: slot.campaignId,
      companyCode: slot.companyCode,
      status: "active",
    });
    if (!campaign) {
      await releaseWithFailure(slotId, lockId, "prepare", new Error("Chiến dịch liên kết không hoạt động hoặc không tồn tại."));
      return;
    }

    try {
      const sheetInput = await campaignContentSheetService.getWorkerInput(
        slot.companyCode,
        String(slot.campaignId),
        String(slot._id)
      );
      const manualBodyText = sheetInput.bodyOverride || slot.customBodyText || "";
      let candidate: {
        _id?: unknown;
        title: string;
        bodyText: string;
        outline?: string;
        mediaPrompt?: string;
        voiceScript?: string;
      };

      if (campaign.imageMode === "real") {
        // Step A: Research the slot and analyze only this slot's real media
        slot.status = "researching";
        slot.transitions.push({
          from: "generating",
          to: "researching",
          reason: "Researcher Agent bắt đầu thu thập bối cảnh trước khi phân tích ảnh thật của slot.",
          at: new Date(),
        });
        await slot.save();
        emitSlotUpdate(slot);

        await ingestRealMedia(slot, campaign);

        let researchContext = "";
        let visualContext = "";
        if (!manualBodyText) {
          researchContext = await getResearchContext(slot, campaign);
          visualContext = await getVisualContext(slot, campaign);
        }

        slot.status = "writing";
        slot.transitions.push({
          from: "researching",
          to: "writing",
          reason: "Đã kết hợp nghiên cứu slot và phân tích ảnh thật. Copywriter Agent bắt đầu viết nội dung.",
          at: new Date(),
        });
        await slot.save();
        emitSlotUpdate(slot);

        if (manualBodyText) {
          // Use pre-written content
          candidate = {
            title: sheetInput.titleOverride || slot.topicBrief || "Bài đăng chiến dịch",
            bodyText: manualBodyText,
            outline: "Nội dung được người dùng khóa trong Campaign Content Sheet",
            mediaPrompt: "Sử dụng ảnh thật Google Drive",
            voiceScript: manualBodyText,
          };
        } else {
          // Let copywriter write it based on the sheet brief
          candidate = await CopywriterAgentService.write(
            slot,
            campaign,
            `${researchContext}\n\n${visualContext}\n\n${sheetInput.contextText}`.trim()
          );
        }
      } else {
        // Step A: Move to "researching" status
        slot.status = "researching";
        slot.transitions.push({
          from: "generating",
          to: "researching",
          reason: "Researcher Agent bắt đầu thu thập bối cảnh và nghiên cứu từ khóa.",
          at: new Date(),
        });
        await slot.save();
        emitSlotUpdate(slot);

        // Run Researcher Agent
        const researchContext = await getResearchContext(slot, campaign);

        // Step B: Move to "writing" status
        slot.status = "writing";
        slot.transitions.push({
          from: "researching",
          to: "writing",
          reason: "Copywriter Agent bắt đầu viết bài viết dựa trên kết quả nghiên cứu.",
          at: new Date(),
        });
        await slot.save();
        emitSlotUpdate(slot);

        // Run Copywriter Agent (Single-Variant Content Generation)
        if (manualBodyText) {
          candidate = {
            title: sheetInput.titleOverride || slot.topicBrief || "Bài đăng chiến dịch",
            bodyText: manualBodyText,
            outline: "Nội dung được người dùng khóa trong Campaign Content Sheet",
            mediaPrompt: "",
            voiceScript: slot.mediaType === "video" || slot.mediaType === "human-video" ? manualBodyText : "",
          };
        } else {
          candidate = await CopywriterAgentService.write(
            slot,
            campaign,
            `${researchContext}\n\n${sheetInput.contextText}`.trim()
          );
        }
      }

      if (sheetInput.titleOverride) candidate.title = sheetInput.titleOverride;

      if (!manualBodyText) {
        const contentCost = campaign.qualityMode === "budget"
          ? API_COSTS.CAMPAIGN_CONTENT_BUDGET
          : API_COSTS.CAMPAIGN_CONTENT_PREMIUM;
        await billCampaignOperation(
          campaign,
          slot,
          "content",
          contentCost,
          `Copywriter Agent for campaign slot ${slot._id}`
        );
      }

      // Create Marketing Content once; retries reuse the record for this slot.
      const content = await MarketingContentModel.findOneAndUpdate(
        { campaignSlotId: slot._id },
        {
          $setOnInsert: {
            companyCode: slot.companyCode,
            authorUid: campaign.createdBy,
            campaignId: String(campaign._id),
            campaignTitle: campaign.title,
            campaignSlotId: slot._id,
            title: candidate.title,
            channel: slot.platform,
            contentType: slot.platform === "TikTok" ? "Video ngắn" : "Bài viết chiến dịch",
            status: "pending",
            bodyText: candidate.bodyText,
            outline: candidate.outline,
            mediaPrompt: candidate.mediaPrompt,
            voiceScript: candidate.voiceScript,
            mediaType: slot.mediaType === "text" ? undefined : slot.mediaType === "image" ? "image" : slot.mediaType,
            generatedAt: new Date(),
            integrationId: slot.integrationId,
          }
        },
        { upsert: true, new: true }
      );

      // Calculate next status
      const nextStatus = slot.mediaType === "text"
        ? (campaign.publishMode === "auto" ? "verifying" : "pending_approval")
        : "generating_media";

      await MarketingCampaignSlotModel.updateOne(
        { _id: slot._id, lockId },
        {
          $set: {
            status: nextStatus,
            selectedCandidateId: candidate._id || null,
            marketingContentId: content._id,
            lockId: null,
            lockedAt: null,
            lockExpiresAt: null,
          },
          $push: {
            transitions: {
              from: "writing",
              to: nextStatus,
              reason: `Đã hoàn thành nội dung bản nháp. Content Sheet row v${sheetInput.rowRevision}, config v${sheetInput.configRevision}. Chuyển sang bước kế tiếp: ${nextStatus}.`,
              at: new Date(),
            },
          },
        }
      );

      console.log(`[Orchestrator] Slot ${slotId} prepare phase completed. Next status: ${nextStatus}`);
      emitSlotUpdate({ _id: slot._id, campaignId: slot.campaignId, companyCode: slot.companyCode, status: nextStatus });

      // Fire-and-forget: gửi thông báo phê duyệt qua Telegram nếu slot cần duyệt
      if (nextStatus === "pending_approval") {
        approvalNotifierService.notifyPendingApproval(slot, campaign).catch(() => undefined);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const statusCode = typeof error === "object" && error !== null
        ? Number((error as { statusCode?: unknown }).statusCode || 0)
        : 0;
      const isBudgetError = statusCode === 402;
      const attemptsExhausted = slot.attemptCount >= 2;
      const targetStatus = isBudgetError || attemptsExhausted ? "needs_attention" : "retrying";
      const errorType = isBudgetError ? "budget" : attemptsExhausted ? "terminal" : "retryable";
      console.error(`[Orchestrator] Error during slot ${slotId} prepare phase:`, error);
      // Retry transient failures with a cap; budget exhaustion requires user attention.
      await MarketingCampaignSlotModel.updateOne(
        { _id: slot._id, lockId },
        {
          $set: {
            status: targetStatus,
            prepareAt: new Date(Date.now() + 5 * 60000), // Retry in 5 minutes
            lockId: null,
            lockedAt: null,
            lockExpiresAt: null,
            lastError: { type: errorType, message: msg, occurredAt: new Date() },
          },
          $inc: { attemptCount: 1 },
          $push: {
            transitions: {
              from: slot.status,
              to: targetStatus,
              reason: `Lỗi Prepare Phase: ${msg}`,
              at: new Date(),
            },
          },
        }
      );
      emitSlotUpdate({ _id: slot._id, campaignId: slot.campaignId, companyCode: slot.companyCode, status: targetStatus });
      if (isBudgetError) {
        await MarketingCampaignModel.updateOne(
          { _id: campaign._id, companyCode: campaign.companyCode, status: "active" },
          { $set: { status: "paused" } }
        );
      }
    }
  }

  /**
   * Pipeline 2: Media Asset Rendering (Media Creator Agent)
   */
  public static async orchestrateMedia(slotId: string, lockId: string): Promise<void> {
    const slot = await MarketingCampaignSlotModel.findOne({
      _id: slotId,
      lockId,
      status: "generating_media",
    });
    if (!slot) return;

    const campaign = await MarketingCampaignModel.findOne({
      _id: slot.campaignId,
      companyCode: slot.companyCode,
      status: "active",
    });
    if (!campaign) {
      await releaseWithFailure(slotId, lockId, "media", new Error("Chiến dịch liên kết không hoạt động hoặc không tồn tại."));
      return;
    }

    const mediaLeaseMs = 20 * 60 * 1000;
    const heartbeat = setInterval(() => {
      void MarketingCampaignSlotModel.updateOne(
        { _id: slotId, lockId, status: "generating_media" },
        {
          $set: {
            lockedAt: new Date(),
            lockExpiresAt: new Date(Date.now() + mediaLeaseMs),
          },
        }
      ).catch((error: unknown) => {
        console.error(
          `[Orchestrator] Unable to renew media lease for slot ${slotId}:`,
          error
        );
      });
    }, Math.floor(mediaLeaseMs / 4));
    heartbeat.unref?.();

    try {
      const nextStatus = campaign.publishMode === "auto" ? "verifying" : "pending_approval";

      if (campaign.imageMode === "real") {
        const content = await MarketingContentModel.findOne({
          _id: slot.marketingContentId,
          companyCode: slot.companyCode,
        });
        if (content) {
          const uploadedUrls = (slot.ingestedMedia || []).map((item) => item.url);
          if (uploadedUrls.length === 0) {
            throw new Error("Media thật chưa được ingest lên Cloudinary.");
          }

          if (slot.mediaType === "video" || slot.mediaType === "human-video") {
            content.videoUrl = uploadedUrls[0] || "";
            content.mediaUrls = uploadedUrls;
            content.mediaType = "video";
          } else {
            content.imageUrl = uploadedUrls[0] || "";
            content.mediaUrls = uploadedUrls;
            content.mediaType = "image";
          }
          await content.save();
          if (
            content.videoUrl &&
            (slot.mediaType === "video" ||
              slot.mediaType === "human-video")
          ) {
            await applyCampaignVideoCaption({
              campaign,
              slot,
              content,
              videoUrl: content.videoUrl,
            });
          }
        }

        await MarketingCampaignSlotModel.updateOne(
          { _id: slot._id, lockId },
          {
            $set: {
              status: nextStatus,
              lockId: null,
              lockedAt: null,
              lockExpiresAt: null,
            },
            $push: {
              transitions: {
                from: "generating_media",
                to: nextStatus,
                reason: `Đã tải lên và gán liên kết ảnh thật CDN Cloudinary. Chuyển sang bước: ${nextStatus}.`,
                at: new Date(),
              },
            },
          }
        );
        console.log(`[Orchestrator] Slot ${slotId} uploaded and linked real images from Drive/Cloudinary. Next status: ${nextStatus}`);
        emitSlotUpdate({ _id: slot._id, campaignId: slot.campaignId, companyCode: slot.companyCode, status: nextStatus });

        // Fire-and-forget: gửi thông báo phê duyệt qua Telegram nếu slot cần duyệt
        if (nextStatus === "pending_approval") {
          approvalNotifierService.notifyPendingApproval(slot, campaign).catch(() => undefined);
        }
      } else {
        // Run Media Creator Agent (AI Generation)
        await MediaCreatorAgentService.createMedia(slot, campaign);

        await MarketingCampaignSlotModel.updateOne(
          { _id: slot._id, lockId },
          {
            $set: {
              status: nextStatus,
              lockId: null,
              lockedAt: null,
              lockExpiresAt: null,
            },
            $push: {
              transitions: {
                from: "generating_media",
                to: nextStatus,
                reason: `Media Creator Agent đã tạo ảnh thành công. Chuyển sang bước: ${nextStatus}.`,
                at: new Date(),
              },
            },
          }
        );
        console.log(`[Orchestrator] Slot ${slotId} media phase completed. Next status: ${nextStatus}`);
        emitSlotUpdate({ _id: slot._id, campaignId: slot.campaignId, companyCode: slot.companyCode, status: nextStatus });

        // Fire-and-forget: gửi thông báo phê duyệt qua Telegram nếu slot cần duyệt
        if (nextStatus === "pending_approval") {
          approvalNotifierService.notifyPendingApproval(slot, campaign).catch(() => undefined);
        }
      }
    } catch (error: unknown) {
      console.error(`[Orchestrator] Error during slot ${slotId} media phase:`, error);
      await releaseWithFailure(slotId, lockId, "media", error);
      emitSlotUpdate({ _id: slot._id, campaignId: slot.campaignId, companyCode: slot.companyCode, status: "failed" });
    } finally {
      clearInterval(heartbeat);
    }
  }

  /**
   * Pipeline 3: Quality Control & Verifying (QC Agent)
   */
  public static async orchestrateVerify(slotId: string, lockId: string): Promise<void> {
    const slot = await MarketingCampaignSlotModel.findOne({
      _id: slotId,
      lockId,
      status: "verifying",
    });
    if (!slot) return;

    const campaign = await MarketingCampaignModel.findOne({
      _id: slot.campaignId,
      companyCode: slot.companyCode,
      status: "active",
    });
    if (!campaign) {
      await releaseWithFailure(slotId, lockId, "verify", new Error("Chiến dịch liên kết không hoạt động hoặc không tồn tại."));
      return;
    }

    try {
      // Run QC Agent verification
      const qcResult = await QcAgentService.verify(slot, campaign);

      if (qcResult.passed) {
        await MarketingCampaignSlotModel.updateOne(
          { _id: slot._id, lockId },
          {
            $set: {
              status: "ready_to_publish",
              lockId: null,
              lockedAt: null,
              lockExpiresAt: null,
              lastError: null,
            },
            $push: {
              transitions: {
                from: "verifying",
                to: "ready_to_publish",
                reason: `QC Agent đã duyệt bài viết (Score: ${qcResult.score}/10). Sẵn sàng đăng bài.`,
                at: new Date(),
              },
            },
          }
        );
        console.log(`[Orchestrator] Slot ${slotId} QC passed. Status transitioned to ready_to_publish.`);
        emitSlotUpdate({ _id: slot._id, campaignId: slot.campaignId, companyCode: slot.companyCode, status: "ready_to_publish" });
      } else {
        // Did not pass QC validation
        const failureReason = qcResult.reasons.join("; ");
        await MarketingCampaignSlotModel.updateOne(
          { _id: slot._id, lockId },
          {
            $set: {
              status: "needs_attention",
              lockId: null,
              lockedAt: null,
              lockExpiresAt: null,
              lastError: { type: "validation", message: failureReason, occurredAt: new Date() },
            },
            $push: {
              transitions: {
                from: "verifying",
                to: "needs_attention",
                reason: `QC Agent từ chối duyệt: ${failureReason}`,
                at: new Date(),
              },
            },
          }
        );
        console.log(`[Orchestrator] Slot ${slotId} QC failed: ${failureReason}`);
        emitSlotUpdate({ _id: slot._id, campaignId: slot.campaignId, companyCode: slot.companyCode, status: "needs_attention" });
      }
    } catch (error: unknown) {
      console.error(`[Orchestrator] Error during slot ${slotId} verify phase:`, error);
      await releaseWithFailure(slotId, lockId, "verify", error);
      emitSlotUpdate({ _id: slot._id, campaignId: slot.campaignId, companyCode: slot.companyCode, status: "failed" });
    }
  }

  /**
   * Pipeline 4: Publishing (Publisher Agent)
   */
  public static async orchestratePublish(slotId: string, lockId: string): Promise<void> {
    const slot = await MarketingCampaignSlotModel.findOne({
      _id: slotId,
      lockId,
      status: "publishing",
    });
    if (!slot) return;

    const campaign = await MarketingCampaignModel.findOne({
      _id: slot.campaignId,
      companyCode: slot.companyCode,
      status: "active",
    });
    if (!campaign) {
      await releaseWithFailure(slotId, lockId, "publish", new Error("Chiến dịch liên kết không hoạt động hoặc không tồn tại."));
      return;
    }

    try {
      // Run Publisher Agent
      const publishResult = await PublisherAgentService.publish(slot, campaign);

      if (publishResult.status === "published") {
        await MarketingCampaignSlotModel.updateOne(
          { _id: slot._id, lockId },
          {
            $set: {
              status: "published",
              publishedPostId: publishResult.postId,
              publishedUrl: publishResult.postUrl,
              lockId: null,
              lockedAt: null,
              lockExpiresAt: null,
            },
            $push: {
              transitions: {
                from: "publishing",
                to: "published",
                reason: "Publisher Agent đã hoàn tất đăng bài lên Facebook thành công.",
                at: new Date(),
              },
            },
          }
        );
        console.log(`[Orchestrator] Slot ${slotId} published successfully.`);
        emitSlotUpdate({ _id: slot._id, campaignId: slot.campaignId, companyCode: slot.companyCode, status: "published" });
      } else {
        // Status is "publishing" (async webhook callback pending)
        await MarketingCampaignSlotModel.updateOne(
          { _id: slot._id, lockId },
          {
            $set: {
              lockId: null,
              lockedAt: null,
              lockExpiresAt: null,
            },
            $push: {
              transitions: {
                from: "publishing",
                to: "publishing",
                reason: "Publisher Agent đã gửi yêu cầu đăng bài. Đang chờ callback từ n8n webhook.",
                at: new Date(),
              },
            },
          }
        );
        console.log(`[Orchestrator] Slot ${slotId} publish requested. Awaiting callback.`);
        emitSlotUpdate({ _id: slot._id, campaignId: slot.campaignId, companyCode: slot.companyCode, status: "publishing" });
      }
    } catch (error: unknown) {
      console.error(`[Orchestrator] Error during slot ${slotId} publish phase:`, error);
      await releaseWithFailure(slotId, lockId, "publish", error);
      emitSlotUpdate({ _id: slot._id, campaignId: slot.campaignId, companyCode: slot.companyCode, status: "failed" });
    }
  }
}
