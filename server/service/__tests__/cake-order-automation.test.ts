import assert from "node:assert/strict";
import test from "node:test";
import { AutomationEventModel } from "../../model/automation-event.model";
import { CakeOrderAutomationModel, ICakeOrderAutomation } from "../../model/cake-order-automation.model";
import { CompanyModel } from "../../model/company.model";
import { FBConversationModel, FBMessageModel } from "../../model/fb-messenger.model";
import { SocialIntegrationModel } from "../../model/social-integration.model";
import { aiKnowledgeService } from "../ai-knowledge.service";
import { cakeOrderAutomationService } from "../cake-order-automation.service";
import { companyTelegramOrderService } from "../company-telegram-order.service";

test("a customer request while waiting for a deposit is held for staff and the same event is not processed twice", async t => {
  const eventStore = new Map<string, {
    requestHash: string;
    state: "processing" | "completed";
    response: Record<string, unknown>;
  }>();
  const eventKey = (value: { companyCode: string; operation: string; eventId: string }) =>
    `${value.companyCode}:${value.operation}:${value.eventId}`;
  const order = {
    orderId: "7e5b97d6-06dc-4dc9-91d2-98f4e7386d9a",
    companyCode: "TEST",
    channel: "facebook",
    accountId: "page-1",
    conversationId: "conversation-1",
    customerName: "Khách thử",
    customerPhone: "",
    designSource: "customer",
    designReferenceUrls: [],
    recipientGroup: "",
    recipientGender: "",
    occasion: "",
    cakeType: "fresh_cream",
    guestCount: 8,
    sizeLabel: "8 người",
    priceOptions: [330_000],
    basePrice: 330_000,
    totalAmount: 330_000,
    inscription: "Chúc mừng sinh nhật",
    pickupDate: "2026-10-20",
    pickupTime: "10:00",
    fulfillmentMethod: "pickup",
    deliveryAddress: "",
    deliveryFee: 0,
    depositRequired: true,
    depositPercent: 30,
    depositAmount: 99_000,
    depositStatus: "pending",
    missingFields: [],
    status: "WAITING_DEPOSIT",
    version: 3,
    lastInboundMessageId: "old-message",
    lastKnowledgeMatches: 0,
    humanReviewReason: "",
    history: [] as Array<Record<string, unknown>>,
    saveCount: 0,
    set(path: string, value: unknown) {
      if (path === "activeConversationKey") this.activeConversationKey = value;
    },
    async save() {
      this.saveCount += 1;
      return this;
    },
    toObject() {
      return Object.fromEntries(Object.entries(this).filter(([key]) =>
        !["saveCount", "set", "save", "toObject"].includes(key)));
    },
  } as unknown as ICakeOrderAutomation & { saveCount: number; activeConversationKey?: unknown };

  t.mock.method(AutomationEventModel, "findOne", (filter) => ({
    lean: async () => eventStore.get(eventKey(filter)) || null,
  }) as never);
  t.mock.method(AutomationEventModel, "create", async event => {
    const key = eventKey(event);
    if (eventStore.has(key)) throw Object.assign(new Error("duplicate event"), { code: 11000 });
    eventStore.set(key, { requestHash: event.requestHash, state: "processing", response: {} });
    return event;
  });
  t.mock.method(AutomationEventModel, "updateOne", async (filter, update) => {
    const event = eventStore.get(eventKey(filter));
    if (!event || event.state !== "processing" || event.requestHash !== filter.requestHash) return { matchedCount: 0 };
    event.state = "completed";
    event.response = update.$set.response as Record<string, unknown>;
    return { matchedCount: 1 };
  });
  t.mock.method(AutomationEventModel, "deleteOne", async filter => {
    eventStore.delete(eventKey(filter));
    return { deletedCount: 1 };
  });
  t.mock.method(CompanyModel, "findOne", () => ({ lean: async () => ({ code: "TEST", sepayConfig: { depositEnabled: true } }) }) as never);
  t.mock.method(SocialIntegrationModel, "findOne", () => ({
    select: () => ({ lean: async () => ({ _id: "integration-1" }) }),
  }) as never);
  t.mock.method(FBConversationModel, "findOne", () => ({
    select: () => ({ lean: async () => ({ _id: "conversation-1" }) }),
  }) as never);
  t.mock.method(FBMessageModel, "findOne", () => ({
    select: () => ({ lean: async () => ({ _id: "message-1" }) }),
  }) as never);
  t.mock.method(FBMessageModel, "find", () => ({
    sort() { return this; },
    limit() { return this; },
    select() { return this; },
    lean: async () => [],
  }) as never);
  t.mock.method(CakeOrderAutomationModel, "findOne", () => ({ sort: () => order }) as never);
  t.mock.method(aiKnowledgeService, "prepareChatContext", async () => ({ contextText: "", matches: 0 }) as never);
  const previousApiKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "openrouter-fixture-key";
  t.after(() => {
    if (previousApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousApiKey;
  });
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      customerName: "",
      customerPhone: "",
      designSource: "",
      recipientGroup: "",
      recipientGender: "",
      occasion: "",
      cakeType: "",
      guestCount: 0,
      selectedPrice: 0,
      inscription: "",
      pickupDate: "",
      pickupTime: "17:00",
      fulfillmentMethod: "",
      deliveryAddress: "",
      customerConfirmed: false,
      asksQuestion: false,
      ragAnswer: "",
      confidence: 1,
    }) } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } }));
  let attentionCount = 0;
  t.mock.method(companyTelegramOrderService, "notifyCakeAutomationAttention", async () => {
    attentionCount += 1;
    return { status: "sent" as const };
  });

  const input = {
    eventId: "fb-message-duplicate-1",
    companyCode: "TEST",
    channel: "facebook" as const,
    accountId: "page-1",
    conversationId: "conversation-1",
    messageId: "message-1",
    customerMessage: "Tôi muốn đổi giờ nhận bánh sang 17:00",
  };
  const first = await cakeOrderAutomationService.nextAction(input);
  const replay = await cakeOrderAutomationService.nextAction(input);

  assert.equal(first.nextAction, "ESCALATE_TO_HUMAN");
  assert.equal(first.requiresHumanApproval, true);
  assert.equal(order.status, "WAITING_DEPOSIT");
  assert.equal(order.pickupTime, "10:00");
  assert.equal(order.version, 4);
  assert.equal(order.saveCount, 1);
  assert.equal(attentionCount, 1);
  assert.deepEqual(replay, first);
});
