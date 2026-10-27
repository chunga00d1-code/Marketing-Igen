function temporaryDnsFailure(error: unknown) {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const value = current as { code?: unknown; cause?: unknown };
    if (value.code === "EAI_AGAIN") return true;
    current = value.cause;
  }
  return false;
}

/** Retry only DNS failures: no connection was established, so no message was delivered. */
export async function facebookSendRequest(url: string, init: RequestInit, beforeAttempt?: () => Promise<void>): Promise<Response> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await beforeAttempt?.();
    try {
      // Do not follow a redirect after a POST: a later DNS failure would no longer
      // prove that the original endpoint never received the message.
      return await globalThis.fetch(url, { ...init, redirect: "error" });
    } catch (error) {
      if (!temporaryDnsFailure(error) || attempt === maxAttempts || init.signal?.aborted) throw error;
      // Never log the request URL: it contains the Page access token.
      console.warn("[FacebookSend][DNS_RETRY]", JSON.stringify({ hostname: new URL(url).hostname,
        failedAttempt: attempt, nextAttempt: attempt + 1, maxAttempts, delayMs: attempt * 1000, code: "EAI_AGAIN" }));
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error("Facebook DNS retry limit reached.");
}
