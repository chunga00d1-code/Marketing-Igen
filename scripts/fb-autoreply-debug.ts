type DebugChannel = "facebook" | "zalo" | "test";

type CliOptions = {
  baseUrl: string;
  token: string;
  conversationId?: string;
  companyCode?: string;
  channel?: DebugChannel;
};

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    args.set(key, value);
    if (value !== "true") i += 1;
  }

  const baseUrl = (args.get("base-url") || args.get("baseUrl") || "http://localhost:3000").replace(/\/+$/, "");
  const token = args.get("token") || "";
  const conversationId = args.get("conversation-id") || args.get("conversationId") || "";
  const companyCode = args.get("company-code") || args.get("companyCode") || "";
  const rawChannel = args.get("channel") || "facebook";
  const channel: DebugChannel | undefined =
    rawChannel === "facebook" || rawChannel === "zalo" || rawChannel === "test"
      ? rawChannel
      : undefined;

  if (!token) {
    throw new Error("Thiếu --token");
  }

  return {
    baseUrl,
    token,
    conversationId: conversationId || undefined,
    companyCode: companyCode || undefined,
    channel,
  };
}

async function fetchJson(baseUrl: string, token: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
  };
}

function printSection(title: string, payload: any) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(payload, null, 2));
}

function summarizePageDiagnostics(data: any) {
  const payload = data?.data || {};
  console.log("\n=== PAGE SUMMARY ===");
  console.log(`isConnected: ${payload.isConnected ? "YES" : "NO"}`);
  console.log(`resolvedPageId: ${payload.resolvedPageId || "none"}`);
  console.log(`hasResolvedToken: ${payload.hasResolvedToken ? "YES" : "NO"}`);
  console.log(`conversationsForResolvedPage: ${payload.conversationsForResolvedPage ?? 0}`);
  console.log(`directOwnerCandidateCount: ${payload.directOwnerCandidateCount ?? 0}`);
  console.log(`crossCompanyIntegrationCount: ${payload.crossCompanyIntegrationCount ?? 0}`);
}

function summarizeConversationDiagnostics(data: any) {
  const payload = data?.data || {};
  console.log("\n=== CONVERSATION SUMMARY ===");
  console.log(`conversationFound: ${payload.conversationFound ? "YES" : "NO"}`);
  console.log(`pageOwnerEmail: ${payload.pageOwnerEmail || "none"}`);
  console.log(`ownerSource: ${payload.ownerSource || "none"}`);
  console.log(`aiEnabled: ${payload.aiEnabled ? "YES" : "NO"}`);
  console.log(`hasPageAccessToken: ${payload.hasPageAccessToken ? "YES" : "NO"}`);
  console.log(`latestMessageDirection: ${payload.latestMessageDirection || "none"}`);
  console.log(`latestMessageId: ${payload.latestMessageId || "none"}`);
  console.log(`shouldTriggerAutoReply: ${payload.shouldTriggerAutoReply ? "YES" : "NO"}`);
  console.log(`reasons: ${(payload.reasons || []).join(", ") || "none"}`);
}

function summarizeAiLogs(data: any) {
  const logs = Array.isArray(data?.logs) ? data.logs : Array.isArray(data?.data?.logs) ? data.data.logs : [];
  console.log("\n=== AI LOG SUMMARY ===");
  console.log(`count: ${logs.length}`);
  for (const log of logs.slice(0, 5)) {
    console.log(
      `- ${log.createdAt || "n/a"} | status=${log.status} | channel=${log.channel} | ` +
      `conversationId=${log.conversationId || "n/a"} | aiResponse=${String(log.aiResponse || "").slice(0, 120)}`
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log("Facebook Auto Reply Debug Tool");
  console.log(
    JSON.stringify(
      {
        baseUrl: options.baseUrl,
        conversationId: options.conversationId || null,
        companyCode: options.companyCode || null,
        channel: options.channel || "facebook",
      },
      null,
      2
    )
  );

  const pageDiagnostics = await fetchJson(
    options.baseUrl,
    options.token,
    "/api/v1/facebook/messenger/diagnostics/page"
  );
  printSection("PAGE DIAGNOSTICS RAW", pageDiagnostics.data);
  summarizePageDiagnostics(pageDiagnostics.data);

  if (options.conversationId) {
    const conversationDiagnostics = await fetchJson(
      options.baseUrl,
      options.token,
      `/api/v1/facebook/messenger/diagnostics/${encodeURIComponent(options.conversationId)}`
    );
    printSection("CONVERSATION DIAGNOSTICS RAW", conversationDiagnostics.data);
    summarizeConversationDiagnostics(conversationDiagnostics.data);
  }

  const aiLogsQuery = new URLSearchParams();
  aiLogsQuery.set("limit", "10");
  if (options.conversationId) aiLogsQuery.set("conversationId", options.conversationId);
  if (options.companyCode) aiLogsQuery.set("companyCode", options.companyCode);
  if (options.channel) aiLogsQuery.set("channel", options.channel);

  const aiLogs = await fetchJson(
    options.baseUrl,
    options.token,
    `/api/v1/facebook/debug-ai-logs?${aiLogsQuery.toString()}`
  );
  printSection("AI LOGS RAW", aiLogs.data);
  summarizeAiLogs(aiLogs.data);
}

main().catch((error) => {
  console.error("[fb-autoreply-debug] Failed:", error.message || error);
  process.exit(1);
});
