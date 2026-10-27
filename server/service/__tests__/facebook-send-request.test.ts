import test from "node:test";
import assert from "node:assert/strict";
import { facebookSendRequest } from "../facebook-send-request";

const url = "https://graph.facebook.com/v25.0/me/messages?access_token=fixture-private-token";
const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: { text: "Tin giả lập" } }) };
const dnsError = () => new TypeError("fetch failed", { cause: Object.assign(new Error("DNS temporarily unavailable"), { code: "EAI_AGAIN" }) });

test("human takeover during DNS backoff prevents the next send attempt", async t => {
  let paused = false;
  t.mock.method(console, "warn", () => undefined);
  const fetch = t.mock.method(globalThis, "fetch", async () => { paused = true; throw dnsError(); });
  await assert.rejects(facebookSendRequest(url, init, async () => {
    if (paused) throw new Error("Human takeover");
  }), /Human takeover/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("a pre-connection DNS failure retries the same text request and never logs the token", async t => {
  let calls = 0;
  const logs: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => logs.push(args.join(" ")));
  t.mock.method(globalThis, "fetch", async (input, options) => {
    calls++; assert.equal(String(input), url); assert.equal(options?.body, init.body);
    assert.equal(options?.redirect, "error");
    if (calls === 1) throw dnsError();
    return new Response(JSON.stringify({ message_id: "fixture-mid" }));
  });
  const response = await facebookSendRequest(url, init);
  assert.equal((await response.json()).message_id, "fixture-mid");
  assert.equal(calls, 2);
  assert.match(logs.join("\n"), /DNS_RETRY/);
  assert.doesNotMatch(logs.join("\n"), /fixture-private-token|access_token/);
});

test("persistent DNS failures stop after three attempts", async t => {
  let calls = 0;
  t.mock.method(console, "warn", () => undefined);
  t.mock.method(globalThis, "fetch", async () => { calls++; throw dnsError(); });
  await assert.rejects(facebookSendRequest(url, init), /fetch failed/);
  assert.equal(calls, 3);
});

test("ambiguous socket and timeout failures are not retried because delivery may have occurred", async t => {
  for (const code of ["UND_ERR_SOCKET", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"]) {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls++; throw new TypeError("fetch failed", { cause: Object.assign(new Error("fixture failure"), { code }) });
    });
    await assert.rejects(facebookSendRequest(url, init), /fetch failed/);
    assert.equal(calls, 1);
  }
});

test("HTTP errors and malformed response bodies cannot resend an accepted request", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("error", { status: 400 }); });
  assert.equal((await facebookSendRequest(url, init)).status, 400);
  assert.equal(calls, 1);
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("not-json", { status: 200 }); });
  await assert.rejects((await facebookSendRequest(url, init)).json());
  assert.equal(calls, 2);
});
