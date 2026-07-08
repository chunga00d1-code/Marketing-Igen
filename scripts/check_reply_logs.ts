import mongoose from "mongoose";
import { AIReplyLogModel } from "../server/model/ai-reply-log.model";
import { UserModel } from "../server/model/user.model";
import { SocialIntegrationModel } from "../server/model/social-integration.model";

const MONGODB_URI = "mongodb://localhost:27017/igen-erp";

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB database");

  const integrations = await SocialIntegrationModel.find({}).lean();
  console.log(`\n=== ALL SOCIAL INTEGRATIONS (${integrations.length}) ===`);
  for (const i of integrations) {
    console.log(`- Platform: ${i.platform}, Page: ${i.displayName} (Page ID: ${i.username || i.blotatoAccountId})`);
    console.log(`  isConnected: ${i.isConnected}`);
    console.log(`  aiAutoReplyConfig:`, JSON.stringify(i.aiAutoReplyConfig, null, 2));
  }

  const users = await UserModel.find({}).lean();
  console.log(`\n=== ALL USERS (${users.length}) ===`);
  for (const u of users) {
    console.log(`- User: ${u.email} (Company: ${u.companyCode})`);
    console.log(`  facebookIntegration:`, JSON.stringify(u.facebookIntegration, null, 2));
    console.log(`  aiAutoReplyConfig:`, JSON.stringify(u.aiAutoReplyConfig, null, 2));
  }

  const logs = await AIReplyLogModel.find({})
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  console.log(`\n=== RECENT AI REPLY LOGS (${logs.length}) ===`);
  for (const log of logs) {
    console.log(`-------------------------------------------`);
    console.log(`Time: ${log.createdAt.toLocaleString()}`);
    console.log(`Channel: ${log.channel}`);
    console.log(`Comment ID: ${log.commentId}`);
    console.log(`Status: ${log.status}`);
    console.log(`Customer Message: "${log.customerMessage}"`);
    console.log(`AI Response: "${String(log.aiResponse).slice(0, 100)}..."`);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
