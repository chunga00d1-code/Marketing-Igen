import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/igen-erp";

async function run() {
  console.log("Connecting to MongoDB at:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);
  console.log("Connected successfully.");

  console.log("Dropping AI Knowledge collections...");
  try {
    await mongoose.connection.db.dropCollection("aiknowledgedocuments");
    console.log("- Dropped aiknowledgedocuments");
  } catch (e: any) {
    console.log("- aiknowledgedocuments collection does not exist or already dropped:", e.message);
  }

  try {
    await mongoose.connection.db.dropCollection("aiknowledgechunks");
    console.log("- Dropped aiknowledgechunks");
  } catch (e: any) {
    console.log("- aiknowledgechunks collection does not exist or already dropped:", e.message);
  }

  console.log("Done. Disconnecting...");
  await mongoose.disconnect();
}

run().catch(console.error);
