import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { htmlVideoRenderRouter } from "../html-video-render.router";

test("does not require authentication for unrelated routes mounted after the HTML video router", async () => {
  const app = express();
  app.use(htmlVideoRenderRouter);
  app.post("/auth/login", (_req, res) => {
    res.status(204).end();
  });

  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const response = await fetch(
      `http://127.0.0.1:${address.port}/auth/login`,
      { method: "POST" }
    );

    assert.equal(response.status, 204);
  } finally {
    server.close();
  }
});
