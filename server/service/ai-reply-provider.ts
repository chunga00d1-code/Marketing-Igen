import { AI_REPLY_PRIMARY_MODEL, AI_REPLY_FALLBACK_MODEL } from "../../shared/ai-reply-models";
import { openrouterChat, type OpenRouterChatParams } from "./openrouter.service";

/** Saved account models cannot override the customer-reply model policy. */
export async function generateReplyCompletion(params: Omit<OpenRouterChatParams, "model">) {
  const generate = async (model: string) => {
    const response = await openrouterChat({ ...params, model });
    if (params.jsonMode || params.responseSchema) JSON.parse(response.text);
    return response;
  };
  try {
    return await generate(AI_REPLY_PRIMARY_MODEL);
  } catch (error) {
    console.warn(`[AI Reply] ${AI_REPLY_PRIMARY_MODEL} failed; falling back to ${AI_REPLY_FALLBACK_MODEL}:`, error instanceof Error ? error.message : String(error));
    return generate(AI_REPLY_FALLBACK_MODEL);
  }
}
