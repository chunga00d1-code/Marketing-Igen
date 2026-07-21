# Hermes Agent Skill: Automated Marketing Campaign Execution via REST API

## Skill Overview
This skill allows Hermes Agent (running on VPS) to accept natural language user requests for creating, managing, and publishing marketing campaigns on Web ERP via official REST APIs.

**IMPORTANT:** Hermes Agent must **NEVER** use browser automation (Playwright/Puppeteer/Selenium) for Web ERP campaign tasks. All actions must be performed using HTTP REST API requests.

---

## Environment & Authentication Setup

### Environment Variables
Hermes Agent must have access to the following environment variables:
- `ERP_API_BASE_URL`: `https://marketing.igentechsolutions.com` (or local/staging URL)
- `ERP_USER_EMAIL`: `<User_Email_Or_Admin_Email>`
- `ERP_USER_PASSWORD`: `<User_Password>`

### Step 1: Authentication Flow (Auto-Login & Token Cache)
Before executing any campaign API, Hermes must ensure it has a valid `accessToken`.

**Login Request:**
- **HTTP Method:** `POST`
- **URL:** `${ERP_API_BASE_URL}/api/v1/auth/login`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "<ERP_USER_EMAIL>",
    "password": "<ERP_USER_PASSWORD>"
  }
  ```

**Login Response Handling:**
- Extract `accessToken` from `response.data.data.accessToken` or `response.data.accessToken`.
- Cache `accessToken` in memory for future API calls.
- If an API call returns `401 Unauthorized` or `jwt expired`, automatically re-run Step 1 to refresh `accessToken` and retry the original request seamlessly.

---

## Social Platform & Page Selection (Chọn Fanpage / Kênh Đăng)

Hermes can query connected Facebook Pages and TikTok channels to select the exact Page requested by the user.

### Query Connected Channels & Pages:
- **HTTP Method:** `GET`
- **URL:** `${ERP_API_BASE_URL}/api/v1/social-integrations` (or `${ERP_API_BASE_URL}/api/v1/crud/social-integrations`)
- **Headers:** `Authorization: Bearer ${accessToken}`
- **Response Structure:** Array of active integrations with `_id`, `platform` ("Facebook" / "TikTok"), `accountName` (e.g. "Tuna's Life"), `isConnected` (boolean).

### Page Selection Rules:
1. **Single Connected Page:** If company has only 1 connected Facebook Page, Hermes automatically uses that Page `_id`.
2. **Multiple Pages (User specifies Page Name):** If user prompt mentions a specific Page name (e.g., *"đăng lên Page Tuna's Life"* or *"chạy chiến dịch ở Fanpage Shop Giày"*), Hermes matches the `accountName` to get the `_id` and attaches it in `integrationIds`:
   ```json
   "integrationIds": {
     "Facebook": "<matched_integration_id>"
   }
   ```
3. **If Specified Page Not Found:** If prompt names a Page that isn't connected, Hermes asks the user politely which of the connected Pages they want to post to.

---

## Input Parameter Specifications & Validation Rules (Lưu Ý Đầu Vào Chi Tiết)

When parsing natural language user prompts into the `POST /api/v1/marketing-campaigns` JSON payload, Hermes Agent **MUST** follow these input rules and constraints:

| Field Name | Type | Allowed Values & Constraints | Fallback / Default Value | Input Extraction Notes & Edge Case Warnings |
| :--- | :--- | :--- | :--- | :--- |
| `sourceBrief` | `string` | Min: 3 chars, Max: 30,000 chars. | **Required** | The raw user prompt or detailed topic brief. **Warning:** If prompt is <3 chars, ask user for a clearer topic. |
| `startDate` | `string` | Pattern: `YYYY-MM-DD` | Tomorrow's date in `Asia/Ho_Chi_Minh` | **Warning:** Format MUST be ISO date string `YYYY-MM-DD`. Do not use locale dates like `20/07/2026`. |
| `endDate` | `string` | Pattern: `YYYY-MM-DD` | `startDate` + (`days` - 1) | **Warning:** Must be >= `startDate`. Maximum duration limit is 90 days. |
| `postsPerDay` | `number` | Integer between 1 and 5. | `1` | **Warning:** If user asks for >5 posts/day, cap at 5 and inform user in chat response. |
| `postingTimes` | `array` | Array of `HH:MM` strings (24h format). Min 1, Max 5. | `["09:00"]` | **CRITICAL:** `postingTimes.length` MUST equal `postsPerDay`. (e.g. If `postsPerDay = 2`, supply `["08:30", "19:30"]`). |
| `platforms` | `array` | Sub-array of `["Facebook", "TikTok"]`. Min 1. | `["Facebook"]` | **Warning:** Must match active connected channels. |
| `integrationIds` | `object` | Object mapping platform to integration ID | `{}` | e.g. `{ "Facebook": "<integration_id>" }`. Used for Page selection. |
| `imageMode` | `string` | `"ai"` or `"real"` | `"ai"` | **CRITICAL:** Set to `"real"` IF user includes a Google Drive link (`https://drive.google.com/...`) OR asks for real product photos. |
| `googleDriveFolderUrl` | `string` | Valid Google Drive folder URL or empty string `""` | `""` | Extract Google Drive link from prompt if present. |
| `qualityMode` | `string` | `"premium"` or `"budget"` | `"premium"` | High quality candidate mode. |
| `publishMode` | `string` | `"manual"` or `"auto"` | `"manual"` | `"manual"` requires user review before posting. `"auto"` publishes automatically on schedule. |
| `publishNow` | `boolean` | `true` or `false` | `false` | Set to `true` IF user explicitly requests "đăng ngay", "đăng luôn", or "instant publish". |
| `rules` | `object` | Optional object with CTA/Hashtags/Forbidden terms | `{}` | e.g. `{ "requiredCta": "Hotline: 0987654321", "requiredHashtags": ["#BrandName"] }` if specified in prompt. |

---

## Skill Execution Workflows

### Workflow 1: Create Marketing Campaign (Tạo Chiến Dịch)

**Trigger:** User sends a natural language message asking to create a marketing campaign.
- *Examples:*
  - "Tạo chiến dịch 14 ngày quảng bá sâm tươi trên Fanpage Tuna's Life"
  - "Lên chiến dịch bán trà sữa tươi tuần tới, mỗi ngày 2 bài lúc 8h và 20h"
  - "Tạo campaign 30 ngày dùng ảnh trong drive https://drive.google.com/drive/folders/xyz"

**Execution Steps:**

1. **Check Token & Auto-Login:**
   - Ensure valid `accessToken` exists. If expired or missing, execute Step 1 Login first.

2. **Query Connected Integrations & Match Page:**
   - Call `GET /api/v1/social-integrations`.
   - Match Page name if mentioned in prompt and set `integrationIds`.

3. **Extract & Validate Input Parameters:**
   - Parse `sourceBrief`, `days`, `postsPerDay`, `postingTimes`, `platforms`, `imageMode`, `googleDriveFolderUrl`, `publishNow`, `rules`.
   - Ensure `postingTimes.length == postsPerDay`.
   - Calculate `startDate` (tomorrow) and `endDate` (`startDate` + `days` - 1).

4. **Call Web ERP Create Campaign API:**
   - **HTTP Method:** `POST`
   - **URL:** `${ERP_API_BASE_URL}/api/v1/marketing-campaigns`
   - **Headers:**
     - `Content-Type: application/json`
     - `Authorization: Bearer ${accessToken}`
   - **Body:**
     ```json
     {
       "sourceBrief": "<user_natural_language_prompt>",
       "startDate": "<startDate_YYYY_MM_DD>",
       "endDate": "<endDate_YYYY_MM_DD>",
       "postsPerDay": 1,
       "postingTimes": ["09:00"],
       "platforms": ["Facebook"],
       "integrationIds": {
         "Facebook": "<selected_page_integration_id>"
       },
       "imageMode": "ai",
       "qualityMode": "premium",
       "publishMode": "manual",
       "googleDriveFolderUrl": "",
       "rules": {}
     }
     ```

5. **Handle Response & Respond in Natural Language:**
   - Extract `campaign._id`, `title`, and `slots.length`.
   - Format Web URL: `${ERP_API_BASE_URL}/campaigns/${campaign._id}`
   - Respond to user in warm, natural conversational Vietnamese.

**Example Natural Language Response to User:**
> "Dạ anh, em vừa khởi tạo thành công chiến dịch **Quảng bá sâm tươi** trên Fanpage **Tuna's Life** cho anh rồi nhé! 🚀
> 
> 📌 **Thời gian:** 14 ngày (Từ `2026-07-21` đến `2026-08-04`)
> 📢 **Fanpage đăng:** Tuna's Life (Facebook)
> ⏰ **Lịch đăng:** 1 bài/ngày vào lúc `09:00`
> 🖼️ **Nguồn media:** Tự động tạo bằng AI Gemini Premium
> 📊 **Tổng số bài viết (Slots):** 14 bài
> 
> Anh có thể nhấn vào đây để xem chi tiết kịch bản và danh sách bài viết trên Web ERP nhé:
> 🔗 https://marketing.igentechsolutions.com/campaigns/6699abc123"

---

### Workflow 2: List / View Campaigns (Xem Danh Sách Chiến Dịch)

**Trigger:** User asks to check running campaigns (e.g., "Kiểm tra các chiến dịch đang chạy", "Cho anh xem các campaign hiện có").

**Execution Steps:**
1. **Call API:** `GET ${ERP_API_BASE_URL}/api/v1/marketing-campaigns?page=1&limit=5`
   - Header: `Authorization: Bearer ${accessToken}`
2. **Format Response:** List campaign titles, statuses, date ranges, and direct clickable links.

---

### Workflow 3: View Queue & Approve / Publish Slot (Duyệt & Đăng Bài)

**Trigger:** User asks to approve or publish a post immediately.

**APIs Available:**
- **List Queue:** `GET ${ERP_API_BASE_URL}/api/v1/marketing-campaigns`
- **Approve Slot:** `POST ${ERP_API_BASE_URL}/api/v1/marketing-campaigns/:campaignId/slots/:slotId/approve`
- **Publish Immediately:** `POST ${ERP_API_BASE_URL}/api/v1/marketing-campaigns/:campaignId/slots/:slotId/publish-now`
- Header required for all: `Authorization: Bearer ${accessToken}`

---

## Error Handling & Resiliency Guidelines (Quy Tắc Xử Lý Lỗi)

1. **HTTP 401 / Token Expired:** Automatically re-authenticate via `/api/v1/auth/login`, refresh `accessToken`, and retry the user's request without prompting the user.
2. **Missing Social Integrations (400 Bad Request):** If API returns error about missing Facebook/TikTok accounts, respond politely explaining that the user needs to connect their Facebook Page or TikTok account in Web ERP Settings first.
3. **Brief Too Short (<3 Chars):** Ask user politely: *"Dạ anh có thể chia sẻ rõ hơn định hướng hoặc chủ đề chiến dịch giúp em không ạ?"*
4. **Date Format Warning:** Never pass date formats like `20/07/2026` or `July 20th`. ALWAYS convert to ISO format `YYYY-MM-DD`.
5. **No Technical Markdown in User Output:** Never output raw JSON strings, cURL commands, or error stack traces to the user. Always present information in clean, professional, conversational Vietnamese.
