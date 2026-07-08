import dotenv from "dotenv";

dotenv.config();

const argv = process.argv.slice(2);
const baseUrl = (argv[0] || "http://localhost:3000").replace(/\/+$/, "");
const pageId = argv[1] || "123456789012345"; // Default mock Page ID
const senderId = argv[2] || "987654321098765"; // Default mock Customer/Sender ID
const message = argv[3] || "Shop ơi gói dịch vụ cơ bản có giá bao nhiêu thế? Có chính sách bảo hành không?";
const postId = argv[4] || "123456789012345_67890";
const commentId = argv[5] || `mock_comment_${Date.now()}`;

const payload = {
  object: "page",
  entry: [
    {
      id: pageId,
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          field: "feed",
          value: {
            item: "comment",
            verb: "add",
            comment_id: commentId,
            parent_id: postId,
            post_id: postId,
            sender_id: senderId,
            message: message,
            created_time: Math.floor(Date.now() / 1000)
          }
        }
      ]
    }
  ]
};

async function run() {
  console.log(`[FB Mock Webhook] Gửi yêu cầu POST tới: ${baseUrl}/api/v1/facebook/webhook`);
  console.log(`[FB Mock Webhook] Page ID: ${pageId}`);
  console.log(`[FB Mock Webhook] Sender ID: ${senderId}`);
  console.log(`[FB Mock Webhook] Post ID: ${postId}`);
  console.log(`[FB Mock Webhook] Comment ID: ${commentId}`);
  console.log(`[FB Mock Webhook] Message: "${message}"`);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  try {
    const res = await fetch(`${baseUrl}/api/v1/facebook/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const status = res.status;
    const text = await res.text();
    console.log(`[FB Mock Webhook] Kết quả: Status=${status}, Response="${text}"`);
  } catch (error: any) {
    console.error(`[FB Mock Webhook] Gặp lỗi khi gửi yêu cầu:`, error.message || error);
  }
}

run();
