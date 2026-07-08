import "dotenv/config";
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/igen-erp";
const COLLECTION_NAME = "fbconversations";
const LEGACY_INDEX_NAME = "pageId_1_facebookConversationId_1";

async function run() {
  console.log(`[fix_fb_conversation_index] Connecting to MongoDB: ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI);
  console.log("[fix_fb_conversation_index] Connected.");

  const db = mongoose.connection.db;
  const collection = db.collection(COLLECTION_NAME);

  const beforeIndexes = await collection.indexes();
  console.log("[fix_fb_conversation_index] Indexes before migration:");
  console.log(JSON.stringify(beforeIndexes, null, 2));

  const emptyConversationIdCount = await collection.countDocuments({
    $or: [
      { facebookConversationId: "" },
      { facebookConversationId: null },
    ],
  });
  console.log(`[fix_fb_conversation_index] Documents with empty/null facebookConversationId: ${emptyConversationIdCount}`);

  if (emptyConversationIdCount > 0) {
    const cleanupResult = await collection.updateMany(
      {
        $or: [
          { facebookConversationId: "" },
          { facebookConversationId: null },
        ],
      },
      {
        $unset: { facebookConversationId: "" },
      }
    );
    console.log(
      `[fix_fb_conversation_index] Cleanup finished. matched=${cleanupResult.matchedCount}, modified=${cleanupResult.modifiedCount}`
    );
  }

  const hasLegacyIndex = beforeIndexes.some((index) => index.name === LEGACY_INDEX_NAME);
  if (hasLegacyIndex) {
    console.log(`[fix_fb_conversation_index] Dropping legacy index: ${LEGACY_INDEX_NAME}`);
    await collection.dropIndex(LEGACY_INDEX_NAME);
  } else {
    console.log(`[fix_fb_conversation_index] Legacy index not found: ${LEGACY_INDEX_NAME}`);
  }

  console.log("[fix_fb_conversation_index] Creating partial unique index on pageId + facebookConversationId");
  await collection.createIndex(
    { pageId: 1, facebookConversationId: 1 },
    {
      name: LEGACY_INDEX_NAME,
      unique: true,
      partialFilterExpression: {
        facebookConversationId: {
          $exists: true,
          $type: "string",
          $ne: "",
        },
      },
    }
  );

  const afterIndexes = await collection.indexes();
  console.log("[fix_fb_conversation_index] Indexes after migration:");
  console.log(JSON.stringify(afterIndexes, null, 2));

  await mongoose.disconnect();
  console.log("[fix_fb_conversation_index] Done.");
}

run().catch(async (error) => {
  console.error("[fix_fb_conversation_index] Failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exit(1);
});
