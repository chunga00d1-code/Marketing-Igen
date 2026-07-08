import dotenv from "dotenv";
dotenv.config();

// Stub database models that might be required during service imports
import mongoose from "mongoose";
if (mongoose.connection.readyState === 0) {
  // Mock mongoose connect if needed, but we only need it to compile/import
}

import { getCompanyHeyGenLibrary } from "../server/service/heygen.service";

async function test() {
  const apiKey = process.env.HEYGEN_API_KEY || "";
  console.log("Testing HeyGen with API Key:", apiKey ? (apiKey.substring(0, 15) + "...") : "NONE");
  try {
    const library = await getCompanyHeyGenLibrary("SYSTEM", apiKey);
    console.log("--- SUCCESS ---");
    console.log("HeyGen library fetched successfully!");
    console.log("Avatars count:", library.avatars?.length);
    console.log("Voices count:", library.voices?.length);
    if (library.avatars && library.avatars.length > 0) {
      console.log("Sample avatar:", library.avatars[0]);
    }
    if (library.voices && library.voices.length > 0) {
      console.log("Sample voice:", library.voices[0]);
    }
  } catch (error: any) {
    console.error("--- ERROR ---");
    console.error("Error fetching HeyGen library:", error.message);
    if (error.details) {
      console.error("Details:", JSON.stringify(error.details, null, 2));
    }
  }
}

test().then(() => {
  process.exit(0);
});
