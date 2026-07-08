import mongoose from "mongoose";
import { UserModel } from "./model/user.model";
import { SocialIntegrationModel } from "./model/social-integration.model";
import { ZaloConversationModel, ZaloMessageModel } from "./model/zalo-messenger.model";
import { FBConversationModel, FBMessageModel } from "./model/fb-messenger.model";

const MONGODB_URI = "mongodb://127.0.0.1:27017/igen-erp";

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB database");

  // 1. Check users and their integrations
  const users = await UserModel.find({});
  console.log(`\n=== USERS AND INTEGRATIONS (${users.length} users) ===`);
  for (const user of users) {
    console.log(`User: ${user.email} (Role: ${user.role})`);
    console.log(`- Zalo integration:`, JSON.stringify(user.zaloIntegration, null, 2));
    console.log(`- FB integration:`, JSON.stringify(user.facebookIntegration, null, 2));
  }

  // 2. Check company social integrations
  const integrations = await SocialIntegrationModel.find({});
  console.log(`\n=== COMPANY SOCIAL INTEGRATIONS (${integrations.length} found) ===`);
  for (const i of integrations) {
    console.log(`- [${i.platform}] companyCode: ${i.companyCode}, name: ${i.displayName}, username/pageId: ${i.username}, isConnected: ${i.isConnected}, isMock: ${i.isMock}`);
  }

  // 3. Check Zalo data
  const zaloConversations = await ZaloConversationModel.find({});
  const zaloMessages = await ZaloMessageModel.find({});
  console.log(`\n=== ZALO DATA ===`);
  console.log(`- Conversations count: ${zaloConversations.length}`);
  console.log(`- Messages count: ${zaloMessages.length}`);
  if (zaloMessages.length > 0) {
    console.log("Latest Zalo messages:");
    const latestZalo = await ZaloMessageModel.find({}).sort({ timestamp: -1 }).limit(5);
    latestZalo.forEach(m => {
      console.log(`  [${m.timestamp.toISOString()}] [${m.direction}] sender: ${m.senderId}, recipient: ${m.recipientId}, text: "${m.text}"`);
    });
  }

  // 4. Check FB data
  const fbConversations = await FBConversationModel.find({});
  const fbMessages = await FBMessageModel.find({});
  console.log(`\n=== FB DATA ===`);
  console.log(`- Conversations count: ${fbConversations.length}`);
  console.log(`- Messages count: ${fbMessages.length}`);
  if (fbMessages.length > 0) {
    console.log("Latest FB messages:");
    const latestFB = await FBMessageModel.find({}).sort({ timestamp: -1 }).limit(5);
    latestFB.forEach(m => {
      console.log(`  [${m.timestamp.toISOString()}] [${m.direction}] sender: ${m.senderId}, recipient: ${m.recipientId}, text: "${m.text}"`);
    });
  }

  await mongoose.disconnect();
}

run().catch(console.error);
