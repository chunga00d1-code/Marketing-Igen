import type { ChatImageObservation } from "../../chat-image-context";

export interface ChatOrderScope {
  companyCode: string;
  pageId: string;
  conversationId: string;
}

export interface ChatOrderFlowSession {
  sessionId: string;
  resetDraft: boolean;
  ask?: string;
}

export interface ChatOrderFlowInput extends ChatOrderScope {
  messageId: string;
  message: string;
  imageUrls: string[];
  observation?: ChatImageObservation;
  visualMode?: boolean;
  freshImage?: boolean;
  replyDeadlineAt?: number;
  businessContext?: string;
  customerAddressStyle?: string;
  session?: ChatOrderFlowSession;
}

export interface ChatOrderFlowReply {
  text: string;
  isMock: boolean;
  draftId: string;
  revision: number;
  qrUrl?: string;
  qrImageAltText?: string;
  sampleImageUrl?: string;
  isSummary?: boolean;
  consultationContext?: string;
  wordingSource?: string;
}

export interface ChatOrderFlowPreview {
  dryRun: true;
  currentState: string;
  proposedDetails: Record<string, unknown>;
  matchedVariants: Array<{ id: string; name: string; size: string; price: number }>;
  requiresConfirmation: true;
  consultationContext?: string;
  wordingSource?: string;
}

export interface ChatOrderFlow {
  key: string;
  isEnabled(pageId: string): Promise<boolean>;
  isActive(pageId: string, conversationId: string): Promise<boolean>;
  prepareSession(scope: ChatOrderScope, messageId: string): Promise<ChatOrderFlowSession>;
  process(input: ChatOrderFlowInput): Promise<ChatOrderFlowReply | undefined>;
  preview?(input: ChatOrderFlowInput): Promise<ChatOrderFlowPreview | undefined>;
  markDelivered(reply: ChatOrderFlowReply): Promise<void>;
  conversationInstructions?: string;
  consultationInstructions?: string;
  preservesReplyFacts?(source: string, candidate: string): boolean;
  splitReply?(text: string): string[];
}
