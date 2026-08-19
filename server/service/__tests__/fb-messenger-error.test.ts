import test from "node:test";
import assert from "node:assert/strict";
import {
  isFacebookReplyWindowOpen,
  translateFacebookSendError,
} from "../fb-messenger-error";

test("recognizes Facebook's expired messaging-window subcode", () => {
  const error = translateFacebookSendError(JSON.stringify({
    error: {
      message: "This message is sent outside the allowed time period.",
      code: 10,
      error_subcode: 2018278,
    },
  }), 400);

  assert.equal(error.statusCode, 422);
  assert.equal(error.code, "FB_MESSAGING_WINDOW_EXPIRED");
  assert.match(error.message, /24 giờ/);
});

test("does not expose raw provider details for an unknown send error", () => {
  const error = translateFacebookSendError("provider internal trace secret", 500);

  assert.equal(error.statusCode, 502);
  assert.equal(error.code, "FB_SEND_FAILED");
  assert.doesNotMatch(error.message, /trace secret/);
});

test("checks the standard 24-hour reply window", () => {
  const now = Date.parse("2026-08-19T08:00:00.000Z");

  assert.equal(isFacebookReplyWindowOpen("2026-08-18T08:00:01.000Z", now), true);
  assert.equal(isFacebookReplyWindowOpen("2026-08-18T07:59:59.000Z", now), false);
  assert.equal(isFacebookReplyWindowOpen(null, now), false);
});
