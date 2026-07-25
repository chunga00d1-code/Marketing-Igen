import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

import { MarketingCampaignSlotModel } from "../server/model/marketing-campaign-slot.model";
import { MarketingCampaignModel } from "../server/model/marketing-campaign.model";

async function main() {
  // Try localhost instead of the docker hostname 'mongodb'
  const uri = "mongodb://localhost:27017/igen-marketing";
  const user = process.env.MONGODB_USER;
  const pass = process.env.MONGODB_PASSWORD;
  const authSource = process.env.MONGODB_AUTH_SOURCE || "admin";

  let connectionUri = uri;
  // Let's first try with auth if credentials exist, otherwise without auth
  if (user && pass) {
    connectionUri = `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@localhost:27017/igen-marketing?authSource=${authSource}`;
  }

  console.log("Connecting to:", connectionUri.replace(/:([^:@]+)@/, ":******@"));
  try {
    await mongoose.connect(connectionUri);
  } catch (err) {
    console.warn("Failed with auth/specific URI, trying simple localhost connection...");
    await mongoose.connect("mongodb://localhost:27017/igen-marketing");
  }

  console.log("Connected successfully!");

  const campaigns = await MarketingCampaignModel.find().lean();
  console.log(`Found ${campaigns.length} campaigns:`);
  for (const c of campaigns) {
    const slots = await MarketingCampaignSlotModel.find({ campaignId: c._id }).lean();
    console.log(`- Campaign: ${c.title} (_id: ${c._id}, status: ${c.status})`);
    console.log(`  Slots count: ${slots.length}`);
    const statusCounts = slots.reduce((acc: any, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {});
    console.log("  Slot statuses:", statusCounts);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
