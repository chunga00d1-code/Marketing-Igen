import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import {
  createShotstackWebhookHandler,
} from "../shotstack-webhook.controller";
import { ShotstackWebhookError } from "../../service/shotstack-render.service";

function responseHarness() {
  let statusCode = 200;
  let body: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(value: unknown) {
      body = value;
      return response;
    },
  } as unknown as Response;
  return {
    response,
    read: () => ({ statusCode, body }),
  };
}

test("accepts a valid Shotstack webhook without JWT context", async () => {
  const accepted: Array<{ payload: unknown; secret: string }> = [];
  const handler = createShotstackWebhookHandler({
    async acceptWebhook(payload, secret) {
      accepted.push({ payload, secret });
    },
  });
  const request = {
    params: { secret: "safe_webhook_secret_12345" },
    body: { id: "provider-render-1", status: "done" },
  } as unknown as Request;
  const harness = responseHarness();

  await handler(request, harness.response);

  assert.deepEqual(accepted, [{
    payload: { id: "provider-render-1", status: "done" },
    secret: "safe_webhook_secret_12345",
  }]);
  assert.deepEqual(harness.read(), {
    statusCode: 202,
    body: { status: "success" },
  });
});

test("returns safe webhook errors and does not expose internal failures", async () => {
  const invalidSecret = createShotstackWebhookHandler({
    async acceptWebhook() {
      throw new ShotstackWebhookError(401, "Invalid Shotstack webhook secret.");
    },
  });
  const unexpectedFailure = createShotstackWebhookHandler({
    async acceptWebhook() {
      throw new Error("SHOTSTACK_API_KEY=private C:\\internal\\render.ts");
    },
  });

  const first = responseHarness();
  await invalidSecret({
    params: { secret: "wrong" },
    body: {},
  } as unknown as Request, first.response);
  assert.deepEqual(first.read(), {
    statusCode: 401,
    body: { status: "error", message: "Invalid Shotstack webhook secret." },
  });

  const second = responseHarness();
  await unexpectedFailure({
    params: { secret: "wrong" },
    body: {},
  } as unknown as Request, second.response);
  assert.deepEqual(second.read(), {
    statusCode: 500,
    body: { status: "error", message: "Shotstack webhook could not be processed." },
  });
});
