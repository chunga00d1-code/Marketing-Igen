import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { extractTikTokWebhookIdentifiers, getTikTokSourceVideoUrl, tiktokService } from "../tiktok.service";

test("parses the serialized content used by official TikTok webhooks", () => {
  const parsed = extractTikTokWebhookIdentifiers({
    client_key: "test-client",
    event: "post.publish.publicly_available",
    create_time: 1_659_000_000,
    user_openid: "creator-open-id",
    content: JSON.stringify({
      publish_id: "publish-test",
      post_id: "post-test",
      publish_type: "DIRECT_POST",
    }),
  });

  assert.equal(parsed.eventType, "post.publish.publicly_available");
  assert.equal(parsed.publishId, "publish-test");
  assert.equal(parsed.postId, "post-test");
});

test("verifies TikTok webhook HMAC against the raw request body", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousClientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const previousWebhookSecret = process.env.TIKTOK_WEBHOOK_SECRET;
  process.env.NODE_ENV = "production";
  process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";
  delete process.env.TIKTOK_WEBHOOK_SECRET;

  try {
    const rawBody = JSON.stringify({
      event: "post.publish.complete",
      content: JSON.stringify({ publish_id: "publish-test" }),
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", process.env.TIKTOK_CLIENT_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    assert.equal(tiktokService.verifyWebhookRequest({
      signature: `t=${timestamp},s=${signature}`,
      rawBody,
    }), true);
    assert.equal(tiktokService.verifyWebhookRequest({
      signature: `t=${timestamp},s=${signature}`,
      rawBody: `${rawBody} `,
    }), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousClientSecret === undefined) delete process.env.TIKTOK_CLIENT_SECRET;
    else process.env.TIKTOK_CLIENT_SECRET = previousClientSecret;
    if (previousWebhookSecret === undefined) delete process.env.TIKTOK_WEBHOOK_SECRET;
    else process.env.TIKTOK_WEBHOOK_SECRET = previousWebhookSecret;
  }
});

test("rejects a stale TikTok webhook signature", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousClientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const previousWebhookSecret = process.env.TIKTOK_WEBHOOK_SECRET;
  process.env.NODE_ENV = "production";
  process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";
  delete process.env.TIKTOK_WEBHOOK_SECRET;

  try {
    const rawBody = "{}";
    const timestamp = String(Math.floor(Date.now() / 1000) - 10 * 60);
    const signature = createHmac("sha256", process.env.TIKTOK_CLIENT_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    assert.equal(tiktokService.verifyWebhookRequest({
      signature: `t=${timestamp},s=${signature}`,
      rawBody,
    }), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousClientSecret === undefined) delete process.env.TIKTOK_CLIENT_SECRET;
    else process.env.TIKTOK_CLIENT_SECRET = previousClientSecret;
    if (previousWebhookSecret === undefined) delete process.env.TIKTOK_WEBHOOK_SECRET;
    else process.env.TIKTOK_WEBHOOK_SECRET = previousWebhookSecret;
  }
});

test("accepts a webhook signed by the TikTok Business app secret", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousClientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const previousBusinessClientSecret = process.env.TIKTOK_BUSINESS_CLIENT_SECRET;
  process.env.NODE_ENV = "production";
  process.env.TIKTOK_CLIENT_SECRET = "personal-app-secret";
  process.env.TIKTOK_BUSINESS_CLIENT_SECRET = "business-app-secret";

  try {
    const rawBody = "{}";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", process.env.TIKTOK_BUSINESS_CLIENT_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    assert.equal(tiktokService.verifyWebhookRequest({
      signature: `t=${timestamp},s=${signature}`,
      rawBody,
    }), true);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousClientSecret === undefined) delete process.env.TIKTOK_CLIENT_SECRET;
    else process.env.TIKTOK_CLIENT_SECRET = previousClientSecret;
    if (previousBusinessClientSecret === undefined) delete process.env.TIKTOK_BUSINESS_CLIENT_SECRET;
    else process.env.TIKTOK_BUSINESS_CLIENT_SECRET = previousBusinessClientSecret;
  }
});

test("only sends a direct video URL when it has the exact configured app origin", () => {
  const appUrl = "https://erp.example.com";
  assert.equal(
    getTikTokSourceVideoUrl("https://erp.example.com/uploads/video.mp4", appUrl),
    "https://erp.example.com/uploads/video.mp4"
  );
  assert.equal(
    getTikTokSourceVideoUrl("https://erp.example.com.evil/video.mp4", appUrl),
    `${appUrl}/api/v1/media/video-proxy?url=${encodeURIComponent("https://erp.example.com.evil/video.mp4")}`
  );
});
