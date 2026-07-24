import assert from "node:assert/strict";
import test from "node:test";
import {
  getShotstackConfig,
  ShotstackClient,
  ShotstackProviderError,
  ShotstackUnavailableError,
} from "../shotstack.client";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.SHOTSTACK_API_KEY;
const originalEnvironment = process.env.SHOTSTACK_ENV;

function setShotstackEnvironment(apiKey = "test-api-key", environment?: string) {
  process.env.SHOTSTACK_API_KEY = apiKey;
  if (environment === undefined) {
    delete process.env.SHOTSTACK_ENV;
  } else {
    process.env.SHOTSTACK_ENV = environment;
  }
}

function mockResponse(body: unknown, init: ResponseInit = {}) {
  globalThis.fetch = (async () => new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    { status: 200, headers: { "content-type": "application/json" }, ...init }
  )) as typeof fetch;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.SHOTSTACK_API_KEY;
  else process.env.SHOTSTACK_API_KEY = originalApiKey;
  if (originalEnvironment === undefined) delete process.env.SHOTSTACK_ENV;
  else process.env.SHOTSTACK_ENV = originalEnvironment;
});

test("uses the stage base URL by default", () => {
  setShotstackEnvironment();
  assert.deepEqual(getShotstackConfig(), {
    environment: "stage",
    baseUrl: "https://api.shotstack.io/stage",
    apiKey: "test-api-key",
  });
});

test("uses the v1 base URL when requested", () => {
  setShotstackEnvironment("test-api-key", "v1");
  assert.equal(getShotstackConfig().baseUrl, "https://api.shotstack.io/v1");
});

test("rejects missing or blank API keys", () => {
  setShotstackEnvironment("   ");
  assert.throws(() => getShotstackConfig(), ShotstackUnavailableError);
});

test("rejects unsupported Shotstack environments", () => {
  setShotstackEnvironment("test-api-key", "production");
  assert.throws(() => getShotstackConfig(), ShotstackUnavailableError);
});

test("sends the API key as an x-api-key request header", async () => {
  setShotstackEnvironment("secret-key");
  let request: Request | undefined;
  globalThis.fetch = (async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ success: true, response: { templates: [] } }));
  }) as typeof fetch;

  await new ShotstackClient().listTemplates();

  assert.equal(request?.headers.get("x-api-key"), "secret-key");
});

test("parses list-template responses", async () => {
  setShotstackEnvironment();
  mockResponse({ success: true, response: { templates: [{ id: "template-1", name: "Promo" }] } });

  assert.deepEqual(await new ShotstackClient().listTemplates(), [{ id: "template-1", name: "Promo" }]);
});

test("parses retrieve-template responses", async () => {
  setShotstackEnvironment();
  mockResponse({ success: true, response: { id: "template-1", name: "Promo", timeline: {} } });

  assert.deepEqual(await new ShotstackClient().getTemplate("template-1"), {
    id: "template-1",
    name: "Promo",
    timeline: {},
  });
});

test("parses render identifiers", async () => {
  setShotstackEnvironment();
  mockResponse({ success: true, response: { id: "render-1" } });

  assert.deepEqual(await new ShotstackClient().renderTemplate({ templateId: "template-1", merge: [] }), {
    renderId: "render-1",
  });
});

test("parses render statuses", async () => {
  setShotstackEnvironment();
  mockResponse({ success: true, response: { id: "render-1", status: "done", url: "https://example.com/video.mp4" } });

  assert.deepEqual(await new ShotstackClient().getRender("render-1"), {
    id: "render-1",
    status: "done",
    url: "https://example.com/video.mp4",
  });
});

test("normalizes malformed and non-JSON provider responses", async () => {
  setShotstackEnvironment();
  mockResponse("not-json");

  await assert.rejects(() => new ShotstackClient().listTemplates(), (error: unknown) => {
    assert.ok(error instanceof ShotstackProviderError);
    assert.match(error.message, /invalid JSON/i);
    return true;
  });
});

test("redacts API keys from provider errors", async () => {
  setShotstackEnvironment("sensitive-api-key");
  mockResponse({ success: false, message: "Invalid sensitive-api-key" }, { status: 401 });

  await assert.rejects(() => new ShotstackClient().listTemplates(), (error: unknown) => {
    assert.ok(error instanceof ShotstackProviderError);
    assert.doesNotMatch(error.message, /sensitive-api-key/);
    return true;
  });
});

test("configures a timeout signal for provider requests", async () => {
  setShotstackEnvironment();
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = (async (_input, init) => {
    signal = init?.signal;
    return new Response(JSON.stringify({ success: true, response: { templates: [] } }));
  }) as typeof fetch;

  await new ShotstackClient().listTemplates();

  assert.ok(signal instanceof AbortSignal);
  assert.equal(signal?.aborted, false);
});
