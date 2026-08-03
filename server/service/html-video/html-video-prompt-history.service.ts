import mongoose from "mongoose";
import {
  HtmlVideoPromptHistoryModel,
  type HtmlVideoPromptHistoryDocument,
} from "../../model/html-video-prompt-history.model";
import type { HtmlVideoActor } from "./html-video-render.service";

type PromptHistoryInput = {
  projectName: string;
  prompt: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  referenceNames: string[];
  parentHistoryId?: string;
};

export type HtmlVideoPromptHistoryPublic = {
  id: string;
  projectName: string;
  prompt: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  referenceNames: string[];
  parentHistoryId: string | null;
  revision: number;
  renderId: string | null;
  createdAt: string;
};

function serializeHistory(
  history: HtmlVideoPromptHistoryDocument
): HtmlVideoPromptHistoryPublic {
  return {
    id: String(history._id),
    projectName: history.projectName,
    prompt: history.prompt,
    aspectRatio: history.aspectRatio,
    referenceNames: history.referenceNames || [],
    parentHistoryId: history.parentHistoryId ? String(history.parentHistoryId) : null,
    revision: history.revision,
    renderId: history.renderId ? String(history.renderId) : null,
    createdAt: history.createdAt.toISOString(),
  };
}

export const htmlVideoPromptHistoryService = {
  async createHistory(
    actor: HtmlVideoActor,
    input: PromptHistoryInput
  ): Promise<HtmlVideoPromptHistoryPublic> {
    let parent: HtmlVideoPromptHistoryDocument | null = null;
    if (input.parentHistoryId) {
      if (!mongoose.isValidObjectId(input.parentHistoryId)) {
        throw new Error("Phiên bản prompt trước đó không hợp lệ.");
      }
      parent = await HtmlVideoPromptHistoryModel.findOne({
        _id: input.parentHistoryId,
        userId: actor.id,
        companyCode: actor.companyCode,
      });
      if (!parent) {
        throw new Error("Không tìm thấy phiên bản prompt trước đó hoặc bạn không có quyền truy cập.");
      }
    }

    const history = await HtmlVideoPromptHistoryModel.create({
      userId: actor.id,
      companyCode: actor.companyCode,
      projectName: input.projectName,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      referenceNames: input.referenceNames,
      parentHistoryId: parent?._id,
      revision: parent ? parent.revision + 1 : 1,
    });
    return serializeHistory(history);
  },

  async listHistory(actor: HtmlVideoActor): Promise<HtmlVideoPromptHistoryPublic[]> {
    const histories = await HtmlVideoPromptHistoryModel.find({
      userId: actor.id,
      companyCode: actor.companyCode,
    })
      .sort({ createdAt: -1 })
      .limit(50);
    return histories.map(serializeHistory);
  },

  async attachRender(actor: HtmlVideoActor, historyId: string, renderId: string) {
    if (!mongoose.isValidObjectId(historyId) || !mongoose.isValidObjectId(renderId)) return;
    await HtmlVideoPromptHistoryModel.updateOne(
      { _id: historyId, userId: actor.id, companyCode: actor.companyCode },
      { $set: { renderId } }
    );
  },
};
