import mongoose from "mongoose";
import { UserModel } from "../server/model/user.model";
import { SocialIntegrationModel } from "../server/model/social-integration.model";
import { AIReplyLogModel } from "../server/model/ai-reply-log.model";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/igen-erp";

async function run() {
  console.log("Connecting to MongoDB at:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);
  console.log("Connected successfully.");

  // 1. Users count and settings
  const users = await UserModel.find({});
  console.log(`\n=== USERS (${users.length} total) ===`);
  users.forEach(u => {
    console.log(`Email: ${u.email}`);
    console.log(`  Role: ${u.role}`);
    console.log(`  Company: ${u.companyCode}`);
    console.log(`  AI Auto Reply Enabled: ${u.aiAutoReplyConfig?.enabled}`);
    console.log(`  AI Model: ${u.aiAutoReplyConfig?.model}`);
    console.log(`  FB Connected: ${u.facebookIntegration?.isConnected} (pageId: ${u.facebookIntegration?.pageId}, verifyToken: ${u.facebookIntegration?.verifyToken})`);
  });

  // 2. Company Integrations
  const integrations = await SocialIntegrationModel.find({});
  console.log(`\n=== COMPANY INTEGRATIONS (${integrations.length} total) ===`);
  integrations.forEach(i => {
    console.log(`Platform: ${i.platform} | Company: ${i.companyCode} | Name: ${i.displayName} | Username/PageId: ${i.username} | Connected: ${i.isConnected}`);
  });

  // 3. AI Reply Logs
  const logs = await AIReplyLogModel.find({}).sort({ createdAt: -1 }).limit(15);
  console.log(`\n=== AI REPLY LOGS (${logs.length} latest) ===`);
  logs.forEach(l => {
    console.log(`[${l.createdAt.toISOString()}] Channel: ${l.channel} | Status: ${l.status}`);
    console.log(`  Customer Message: "${l.customerMessage}"`);
    console.log(`  AI Response: "${l.aiResponse}"`);
    console.log(`  Latency: ${l.latencyMs}ms`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
