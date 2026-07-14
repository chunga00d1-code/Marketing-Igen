import fetch from "node-fetch";

export interface DriveFileItem {
  id: string;
  name: string;
  directUrl: string;
  isVideo: boolean;
}

/**
 * Phân tích URL Google Drive và chuyển đổi thành đường dẫn direct tải trực tiếp (hoặc dùng làm src cho thẻ img/video)
 */
export function getGoogleDriveDirectLink(urlOrId: string, mediaType: "image" | "video" = "image"): string {
  if (!urlOrId) return "";
  
  // Nếu chỉ truyền vào ID hoặc trích xuất File ID từ đường dẫn Google Drive chia sẻ
  const match = urlOrId.match(/(?:\/d\/|id=)([\w-]+)/);
  const fileId = match ? match[1] : urlOrId;
  
  // Kiểm tra tính hợp lệ sơ bộ của ID
  if (/^[\w-]+$/.test(fileId)) {
    if (mediaType === "video") {
      // Direct streaming/download link cho video Google Drive
      return `https://drive.google.com/uc?export=download&id=${fileId}`;
    }
    // Dạng này tối ưu nhất cho hình ảnh (dùng cho src của thẻ img, bypass cookie/auth của Drive)
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }
  
  return urlOrId;
}

/**
 * Chuyển đổi đường dẫn Google Sheet thông thường sang đường dẫn xuất dữ liệu CSV trực tiếp
 */
export function getGoogleSheetCsvUrl(sheetUrl: string): string {
  if (!sheetUrl) return "";
  const match = sheetUrl.match(/\/spreadsheets\/d\/([\w-]+)/);
  if (match && match[1]) {
    const sheetId = match[1];
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  }
  return sheetUrl;
}

/**
 * Parse nội dung CSV thành dạng mảng 2 chiều, hỗ trợ ký tự nằm trong dấu ngoặc kép
 */
export function parseCsv(csvText: string): string[][] {
  const lines = csvText.split(/\r?\n/);
  return lines
    .map((line) => {
      if (!line.trim()) return null;
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    })
    .filter((row): row is string[] => row !== null);
}

/**
 * Nhận diện định dạng tệp là hình ảnh hay video từ URL hoặc tên file
 */
export function detectMediaType(urlOrFilename: string): "image" | "video" {
  if (!urlOrFilename) return "image";
  const videoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".3gp"];
  const lower = urlOrFilename.toLowerCase();
  
  // Kiểm tra tên mở rộng
  if (videoExtensions.some((ext) => lower.includes(ext) || lower.endsWith(ext))) {
    return "video";
  }
  
  return "image";
}

/**
 * Tải và parse dữ liệu từ một liên kết Google Sheet công khai
 */
export async function fetchGoogleSheetData(sheetUrl: string): Promise<string[][]> {
  const csvUrl = getGoogleSheetCsvUrl(sheetUrl);
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`Không thể tải dữ liệu từ Google Sheet. Mã phản hồi: ${response.status}. Hãy chắc chắn rằng bạn đã chia sẻ Sheet này ở chế độ công khai.`);
  }
  const csvText = await response.text();
  const rows = parseCsv(csvText);
  
  // Bỏ qua dòng tiêu đề đầu tiên (Header row)
  if (rows.length > 0) {
    rows.shift();
  }
  
  return rows;
}

/**
 * Quét danh sách file từ thư mục Google Drive công khai
 */
export async function listGoogleDriveFolderFiles(folderUrl: string): Promise<Array<{ id: string; name: string }>> {
  if (!folderUrl) throw new Error("Chưa nhập đường dẫn thư mục Google Drive.");
  
  const match = folderUrl.match(/(?:\/folders\/|id=)([\w-]+)/);
  if (!match || !match[1]) {
    throw new Error("Đường dẫn thư mục Google Drive không hợp lệ. Vui lòng kiểm tra lại.");
  }
  const folderId = match[1];
  const url = `https://drive.google.com/embeddedfolderview?id=${folderId}`;
  
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }
  });
  
  if (!response.ok) {
    throw new Error(`Không thể kết nối tới Google Drive. Vui lòng đảm bảo thư mục đã được chia sẻ ở chế độ "Bất kỳ ai có liên kết đều có thể xem".`);
  }
  
  const html = await response.text();
  const files: Array<{ id: string; name: string }> = [];
  
  // Trích xuất từ mảng JSON items trong mã nguồn của Google Drive folderview
  const itemsMatch = html.match(/"items":\s*(\[[^\]]+\])/);
  if (itemsMatch && itemsMatch[1]) {
    try {
      const items = JSON.parse(itemsMatch[1]);
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.id && item.title) {
            files.push({ id: item.id, name: item.title });
          }
        }
      }
    } catch {
      // Bỏ qua lỗi và chuyển sang regex fallback
    }
  }
  
  // Regex fallback 1: Tìm cấu trúc JSON dạng {"id":"...","title":"..."}
  if (files.length === 0) {
    const regex = /\{"id"\s*:\s*"([^"]+)"\s*,\s*"title"\s*:\s*"([^"]+)"/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
      files.push({ id: m[1], name: m[2] });
    }
  }

  // Regex fallback 2: Tìm link HTML dạng href="/file/d/FILE_ID/view..."
  if (files.length === 0) {
    const linkRegex = /href="\/file\/d\/([\w-]+)\/view[^>]*>([^<]+)/g;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      files.push({ id: m[1], name: m[2].trim() });
    }
  }
  
  return files;
}

/**
 * Gom nhóm các file media theo thứ tự bài đăng và nhận diện định dạng
 */
export function groupDriveFiles(files: Array<{ id: string; name: string }>): Record<number, DriveFileItem[]> {
  const grouped: Record<number, DriveFileItem[]> = {};
  
  for (const file of files) {
    const lowerName = file.name.toLowerCase();
    const isImage = /\.(jpg|jpeg|png|webp|gif|heic)$/.test(lowerName);
    const isVideo = /\.(mp4|mov|avi|webm)$/.test(lowerName);
    
    // Bỏ qua các file không phải là tệp media hợp lệ
    if (!isImage && !isVideo) continue;
    
    // Tìm các số thứ tự trong tên file (Ví dụ: post_1_2.png -> digits: ["1", "2"])
    const digits = file.name.match(/\d+/g);
    let postNum = -1;
    
    if (digits && digits.length > 0) {
      postNum = parseInt(digits[0], 10);
    }
    
    if (postNum !== -1) {
      if (!grouped[postNum]) {
        grouped[postNum] = [];
      }
      
      const directUrl = getGoogleDriveDirectLink(file.id, isVideo ? "video" : "image");
      grouped[postNum].push({
        id: file.id,
        name: file.name,
        directUrl,
        isVideo,
      });
    }
  }
  
  // Sắp xếp các ảnh con trong cùng một nhóm album theo thứ tự subindex hoặc bảng chữ cái
  for (const postNum of Object.keys(grouped).map(Number)) {
    grouped[postNum].sort((a, b) => {
      const aDigits = a.name.match(/\d+/g);
      const bDigits = b.name.match(/\d+/g);
      const aSub = aDigits && aDigits.length > 1 ? parseInt(aDigits[1], 10) : 0;
      const bSub = bDigits && bDigits.length > 1 ? parseInt(bDigits[1], 10) : 0;
      if (aSub !== bSub) return aSub - bSub;
      return a.name.localeCompare(b.name);
    });
  }
  
  return grouped;
}
