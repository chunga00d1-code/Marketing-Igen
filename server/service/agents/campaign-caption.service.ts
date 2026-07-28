import { IMarketingCampaign } from "../../interface/marketing-campaign.interface";
import { IMarketingCampaignSlot } from "../../interface/marketing-campaign-slot.interface";
import { IMarketingContent } from "../../interface/marketing-content.interface";
import { VideoCaptionJobDto } from "../../../shared/video-caption.contract";
import {
  hashCaptionInput,
} from "../video-caption-domain.service";
import { videoCaptionService } from "../video-caption.service";
import { VideoCaptionProjectModel } from "../../model/video-caption-project.model";

async function processPreparedJob(job: VideoCaptionJobDto) {
  if (job.status !== "completed") {
    await videoCaptionService.processJob(job.id);
  }
}

export async function applyCampaignVideoCaption(input: {
  campaign: IMarketingCampaign;
  slot: IMarketingCampaignSlot;
  content: IMarketingContent;
  videoUrl: string;
}) {
  const mode = input.campaign.captionMode || "none";
  if (mode === "none") return input.videoUrl;
  if (!/^https:\/\//i.test(input.videoUrl)) {
    throw new Error(
      "Không thể tạo caption vì video chiến dịch không có URL HTTPS hợp lệ."
    );
  }

  const creationKey = [
    "campaign-caption",
    input.campaign._id,
    input.slot._id,
    hashCaptionInput(input.videoUrl).slice(0, 20),
  ].join(":");
  const created = await videoCaptionService.createProject(
    input.slot.companyCode,
    input.campaign.createdBy,
    {
      name: `Caption · ${input.content.title}`,
      mode,
      source: {
        kind: "campaign",
        url: input.videoUrl,
        mediaId: String(input.content._id),
        originalName: `campaign-${input.slot._id}.mp4`,
      },
      contextBrief: [
        input.slot.objective,
        input.slot.topicBrief,
        input.content.bodyText,
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 2000),
      contextLinks: {
        marketingContentId: String(input.content._id),
        campaignId: String(input.campaign._id),
        campaignSlotId: String(input.slot._id),
      },
      autoAnalyze: false,
      idempotencyKey: creationKey,
    }
  );
  let detail = await videoCaptionService.getProjectDetail(
    input.slot.companyCode,
    created.project.id
  );
  if (
    detail.project.status === "completed" &&
    detail.project.output?.captionedVideoUrl
  ) {
    return detail.project.output.captionedVideoUrl;
  }

  const analysisJob = await videoCaptionService.prepareAnalysisJob(
    input.slot.companyCode,
    created.project.id,
    input.campaign.createdBy
  );
  await processPreparedJob(analysisJob);

  if (mode === "speech" || mode === "combined") {
    const transcriptionJob =
      await videoCaptionService.prepareTranscriptionJob(
        input.slot.companyCode,
        created.project.id,
        input.campaign.createdBy
      );
    await processPreparedJob(transcriptionJob);
  }
  if (mode === "context" || mode === "combined") {
    const contextJob = await videoCaptionService.prepareContextJob(
      input.slot.companyCode,
      created.project.id,
      input.campaign.createdBy
    );
    await processPreparedJob(contextJob);
  }

  detail = await videoCaptionService.getProjectDetail(
    input.slot.companyCode,
    created.project.id
  );
  if (!detail.segments.length) {
    throw new Error(
      "Caption chiến dịch không tạo được đoạn nội dung hợp lệ."
    );
  }
  const renderJob = await videoCaptionService.prepareRenderJob(
    input.slot.companyCode,
    created.project.id,
    input.campaign.createdBy,
    false
  );
  await processPreparedJob(renderJob);

  detail = await videoCaptionService.getProjectDetail(
    input.slot.companyCode,
    created.project.id
  );
  const captionedVideoUrl =
    detail.project.output?.captionedVideoUrl;
  if (!captionedVideoUrl) {
    throw new Error(
      "Kết xuất caption chiến dịch hoàn tất nhưng không có video đầu ra."
    );
  }
  input.content.sourceVideoUrl =
    input.content.sourceVideoUrl || input.videoUrl;
  input.content.videoUrl = captionedVideoUrl;
  input.content.videoCaptionProjectId = created.project.id;
  await input.content.save();
  return captionedVideoUrl;
}

export async function assertCampaignVideoReady(input: {
  campaign: IMarketingCampaign;
  slot: IMarketingCampaignSlot;
  content: IMarketingContent;
}) {
  if (
    input.slot.platform === "TikTok" &&
    (!["video", "human-video"].includes(input.slot.mediaType) ||
      !/^https:\/\//i.test(input.content.videoUrl || ""))
  ) {
    throw new Error(
      "TikTok bắt buộc phải có video HTTPS hoàn chỉnh; không chấp nhận ảnh hoặc text fallback."
    );
  }
  if (!["video", "human-video"].includes(input.slot.mediaType)) return;
  if ((input.campaign.captionMode || "none") === "none") return;
  if (!input.content.videoCaptionProjectId) {
    throw new Error(
      "Chiến dịch yêu cầu caption nhưng chưa có dự án caption liên kết."
    );
  }
  const project = await VideoCaptionProjectModel.findOne({
    _id: input.content.videoCaptionProjectId,
    companyCode: input.slot.companyCode,
    status: "completed",
  })
    .select("output.captionedVideoUrl")
    .lean();
  if (
    !project?.output?.captionedVideoUrl ||
    project.output.captionedVideoUrl !== input.content.videoUrl
  ) {
    throw new Error(
      "Video caption chưa hoàn tất hoặc video hiện tại không khớp bản kết xuất đã xác minh."
    );
  }
}
