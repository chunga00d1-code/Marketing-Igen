import { MarketingCampaignModel } from "../../model/marketing-campaign.model";
import { MarketingCampaignSlotModel } from "../../model/marketing-campaign-slot.model";
import { MarketingContentModel } from "../../model/marketing-content.model";
import { ResearcherAgentService } from "./researcher-agent.service";
import { CopywriterAgentService } from "./copywriter-agent.service";
import { MediaCreatorAgentService } from "./media-creator-agent.service";
import { QcAgentService } from "./qc-agent.service";
import { PublisherAgentService } from "./publisher-agent.service";
import { releaseWithFailure } from "./campaign-utils";

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
      // Step A: Move to "researching" status
      slot.status = "researching";
      slot.transitions.push({
        from: "generating",
        to: "researching",
        reason: "Researcher Agent bắt đầu thu thập bối cảnh và nghiên cứu từ khóa.",
        at: new Date(),
      });
      await slot.save();

      // Run Researcher Agent
      const researchContext = await ResearcherAgentService.research(slot, campaign);

      // Step B: Move to "writing" status
      slot.status = "writing";
      slot.transitions.push({
        from: "researching",
        to: "writing",
        reason: "Copywriter Agent bắt đầu viết bài viết dựa trên kết quả nghiên cứu.",
        at: new Date(),
      });
      await slot.save();

      // Run Copywriter Agent (Single-Variant Content Generation)
      const candidate = await CopywriterAgentService.write(slot, campaign, researchContext);

      // Create Marketing Content
      const content = await MarketingContentModel.create({
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
      });

      // Calculate next status
      const nextStatus = slot.mediaType === "text"
        ? (campaign.publishMode === "auto" ? "verifying" : "pending_approval")
        : "generating_media";

      await MarketingCampaignSlotModel.updateOne(
        { _id: slot._id, lockId },
        {
          $set: {
            status: nextStatus,
            selectedCandidateId: candidate._id,
            marketingContentId: content._id,
            lockId: null,
            lockedAt: null,
            lockExpiresAt: null,
          },
          $push: {
            transitions: {
              from: "writing",
              to: nextStatus,
              reason: `Đã hoàn thành nội dung bản nháp. Chuyển sang bước kế tiếp: ${nextStatus}.`,
              at: new Date(),
            },
          },
        }
      );

      console.log(`[Orchestrator] Slot ${slotId} prepare phase completed. Next status: ${nextStatus}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Orchestrator] Error during slot ${slotId} prepare phase:`, error);
      // Reset to retrying to let the worker retry it
      await MarketingCampaignSlotModel.updateOne(
        { _id: slot._id, lockId },
        {
          $set: {
            status: "retrying",
            prepareAt: new Date(Date.now() + 5 * 60000), // Retry in 5 minutes
            lockId: null,
            lockedAt: null,
            lockExpiresAt: null,
            lastError: { type: "retryable", message: msg, occurredAt: new Date() },
          },
          $inc: { attemptCount: 1 },
          $push: {
            transitions: {
              from: slot.status,
              to: "retrying",
              reason: `Lỗi Prepare Phase: ${msg}`,
              at: new Date(),
            },
          },
        }
      );
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

    try {
      // Run Media Creator Agent
      await MediaCreatorAgentService.createMedia(slot, campaign);

      // Next status logic: auto -> verifying, manual -> pending_approval
      const nextStatus = campaign.publishMode === "auto" ? "verifying" : "pending_approval";

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
    } catch (error: unknown) {
      console.error(`[Orchestrator] Error during slot ${slotId} media phase:`, error);
      await releaseWithFailure(slotId, lockId, "media", error);
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
      }
    } catch (error: unknown) {
      console.error(`[Orchestrator] Error during slot ${slotId} verify phase:`, error);
      await releaseWithFailure(slotId, lockId, "verify", error);
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
      }
    } catch (error: unknown) {
      console.error(`[Orchestrator] Error during slot ${slotId} publish phase:`, error);
      await releaseWithFailure(slotId, lockId, "publish", error);
    }
  }
}
