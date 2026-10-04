import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { GeminiChatService } from "../chat.service";

type RequestBody = { messages: { role: string; content: string }[] };

function mockAI(context: TestContext, outputs: string[]) {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  context.after(() => {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  });
  const requests: RequestBody[] = [];
  context.mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)) as RequestBody);
    const content = outputs[requests.length - 1];
    assert.notEqual(content, undefined, "Unexpected AI call");
    return new Response(JSON.stringify({
      choices: [{ message: { content } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return requests;
}

const service = new GeminiChatService();
const baseConfig = { companyName: "Test Shop", model: "deepseek-v4-flash-0731" };
const corrected = (text: string) => JSON.stringify({ compliant: true, correctedParts: [text] });
const verified = JSON.stringify({ compliant: true });

test("blank settings keep the default prompt without custom review", async (context) => {
  const requests = mockAI(context, ["dạ anh chị cần mẫu nào?"]);
  const result = await service.chat("Tư vấn giúp tôi", [], {
    ...baseConfig, advancedInstructions: "  ", customerAddressStyle: "\n",
  });
  assert.equal(result.text, "dạ anh chị cần mẫu nào?");
  assert.equal(requests.length, 1);
  const prompt = requests[0].messages.find((message) => message.role === "system")?.content || "";
  assert.match(prompt, /Mặc định gọi khách là "anh chị"/);
  assert.match(prompt, /Không đặt dấu chấm/);
  assert.doesNotMatch(prompt, /Cách gọi khách bắt buộc:/);
});

test("address-only settings trigger correction and final verification", async (context) => {
  const requests = mockAI(context, ["Quý khách cần gì?", corrected("chị cần mẫu nào?"), verified]);
  const result = await service.chat("Tư vấn giúp tôi", [], { ...baseConfig, customerAddressStyle: " chị " });
  assert.equal(result.text, "chị cần mẫu nào?");
  assert.equal(requests.length, 3);
  assert.match(requests[0].messages[0].content, /Cách gọi khách bắt buộc: “chị”/);
  assert.doesNotMatch(requests[0].messages[0].content, /Có vô tình dùng "Anh\/Chị" thay vì "anh chị" không/);
  assert.match(JSON.stringify(requests[1]), /chị/);
  assert.match(JSON.stringify(requests[2]), /chị cần mẫu nào/);
});

test("rule-only settings can override default address and punctuation", async (context) => {
  const rule = "Xưng tôi, gọi khách là bạn. Kết thúc bằng dấu chấm.";
  const requests = mockAI(context, ["em hỗ trợ anh chị nhé", corrected("Tôi hỗ trợ bạn."), verified]);
  const result = await service.chat("Tư vấn giúp tôi", [], { ...baseConfig, advancedInstructions: rule });
  assert.equal(result.text, "Tôi hỗ trợ bạn.");
  assert.match(requests[0].messages[0].content, /Nếu rule có chỉ dẫn cách gọi khách thì tuân theo rule/);
  assert.ok(JSON.stringify(requests[1]).includes(rule));
});

test("explicit address priority is shared by generation and review", async (context) => {
  const requests = mockAI(context, ["bạn cần gì?", corrected("chị cần gì?"), verified]);
  const result = await service.chat("Tư vấn giúp tôi", [], {
    ...baseConfig, customerAddressStyle: "chị", advancedInstructions: "Gọi khách là bạn",
  });
  assert.equal(result.text, "chị cần gì?");
  assert.match(requests[0].messages[0].content, /Ưu tiên ô cấu hình này nếu rule/);
  assert.match(requests[1].messages[0].content, /explicit customer address setting overrides/);
});

test("failed final verification blocks the response", async (context) => {
  mockAI(context, ["bạn cần gì?", corrected("bạn cần gì?"), JSON.stringify({ compliant: false })]);
  await assert.rejects(
    service.chat("Tư vấn giúp tôi", [], { ...baseConfig, customerAddressStyle: "chị" }),
    /could not confirm a compliant reply/,
  );
});

test("empty corrected output cannot bypass review via a fallback reply", async (context) => {
  const requests = mockAI(context, ["bạn cần gì?", corrected(" ")]);
  await assert.rejects(
    service.chat("Tư vấn giúp tôi", [], { ...baseConfig, customerAddressStyle: "chị" }),
    /could not produce a valid corrected reply/,
  );
  assert.equal(requests.length, 2);
});
