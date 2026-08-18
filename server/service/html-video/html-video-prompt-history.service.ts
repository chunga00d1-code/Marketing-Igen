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

export type HtmlVideoPromptContextItem = Pick<
  HtmlVideoPromptHistoryPublic,
  "id" | "projectName" | "prompt" | "revision" | "createdAt"
>;

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

  async getContextChain(
    actor: HtmlVideoActor,
    historyId: string,
    limit = 8
  ): Promise<HtmlVideoPromptContextItem[]> {
    if (!mongoose.isValidObjectId(historyId)) {
      throw new Error("Phiên bản prompt không hợp lệ.");
    }

    const chain: HtmlVideoPromptContextItem[] = [];
    const visited = new Set<string>();
    let currentId: string | null = historyId;

    while (currentId && chain.length < Math.max(1, Math.min(limit, 12))) {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const history = await HtmlVideoPromptHistoryModel.findOne({
        _id: currentId,
        userId: actor.id,
        companyCode: actor.companyCode,
      });
      if (!history) {
        if (chain.length === 0) {
          throw new Error("Không tìm thấy lịch sử prompt hoặc bạn không có quyền truy cập.");
        }
        break;
      }
      const serialized = serializeHistory(history);
      chain.push({
        id: serialized.id,
        projectName: serialized.projectName,
        prompt: serialized.prompt,
        revision: serialized.revision,
        createdAt: serialized.createdAt,
      });
      currentId = serialized.parentHistoryId;
    }

    return chain.reverse();
  },

  async attachRender(actor: HtmlVideoActor, historyId: string, renderId: string) {
    if (!mongoose.isValidObjectId(historyId) || !mongoose.isValidObjectId(renderId)) return;
    await HtmlVideoPromptHistoryModel.updateOne(
      { _id: historyId, userId: actor.id, companyCode: actor.companyCode },
      { $set: { renderId } }
    );
  },
};
