import mongoose from "mongoose";
import { UserModel } from "../server/model/user.model";
import { SocialIntegrationModel } from "../server/model/social-integration.model";

const MONGODB_URI = "mongodb://localhost:27017/igen-erp";

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  // Find a user or create one
  let user = await UserModel.findOne({ email: "tuna@tuna.com" });
  if (!user) {
    user = await UserModel.create({
      email: "tuna@tuna.com",
      displayName: "Tuna",
      companyCode: "TUNA",
    });
  }

  // Update user's facebookIntegration and aiAutoReplyConfig
  user.facebookIntegration = {
    isConnected: true,
    pageId: "123456789012345",
    pageName: "Mock Fanpage",
    pageAccessToken: "EAA...", // Mock token
    appSecret: "secret",
    verifyToken: "igen_verify_token",
    connectedAt: new Date(),
    isMock: true,
  };
  user.aiAutoReplyConfig = {
    enabled: true,
    commentReplyEnabled: true,
    autoClassify: true,
    autoCloseDeal: false,
    autoFeedback: false,
    replyDelay: 0,
    advancedInstructions: "Luôn xưng hô Dạ/Thưa.",
    trainingKnowledge: "Sản phẩm A giá 100k.",
    model: "gemini-3.5-flash",
    disabledAt: null,
  };
  await user.save();
  console.log("User updated with mock Facebook integration");

  // Create or update SocialIntegrationModel
  await SocialIntegrationModel.deleteMany({ platform: "Facebook", username: "123456789012345" });
  await SocialIntegrationModel.create({
    companyCode: "TUNA",
    platform: "Facebook",
    displayName: "Mock Fanpage",
    username: "123456789012345",
    isConnected: true,
    createdBy: user._id.toString(),
    accessToken: "mock_page_access_token_123456789012345",
    aiAutoReplyConfig: {
      enabled: true,
      commentReplyEnabled: true,
      autoClassify: true,
      autoCloseDeal: false,
      autoFeedback: false,
      replyDelay: 0,
      advancedInstructions: "Luôn xưng hô Dạ/Thưa.",
      trainingKnowledge: "Sản phẩm A giá 100k.",
      model: "gemini-3.5-flash",
      disabledAt: null,
    }
  });
  console.log("SocialIntegration created for mock Facebook Page");

  await mongoose.disconnect();
  console.log("Done");
}

run().catch(console.error);
