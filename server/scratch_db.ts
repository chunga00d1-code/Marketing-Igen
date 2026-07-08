import { connectDB } from "./config/database";
import { ProductModel } from "./model/product.model";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  await connectDB();
  const fetched = await ProductModel.findOne({ sku: "TESTSKU99" }).lean();
  console.log("TESTSKU99 db record:", JSON.stringify(fetched, null, 2));
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
