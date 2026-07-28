import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { UserModel } from "../model/user.model";
import { PermissionModel } from "../model/permission.model";

/**
 * Tự động tạo tài khoản Super Admin nếu chưa tồn tại
 */
async function seedSuperAdmin() {
  try {
    const saEmail = (process.env.VITE_SUPERADMIN_EMAIL || "superadmin@igen.com").toLowerCase().trim();
    const saPassword = process.env.VITE_SUPERADMIN_PASSWORD || "superadmin123";
    const saName = process.env.VITE_SUPERADMIN_NAME || "Super Admin";

    const existingSA = await UserModel.findOne({ role: "superadmin" });
    if (existingSA) {
      console.log("[Backend Database] Super Admin da ton tai trong database.");
      return;
    }

    const userWithEmail = await UserModel.findOne({ email: saEmail });
    if (userWithEmail) {
      console.log(`[Backend Database] Tim thay tai khoan trung email ${saEmail}. Nang cap len Super Admin...`);
      userWithEmail.role = "superadmin";
      await userWithEmail.save();
      console.log("[Backend Database] Nang cap tai khoan len Super Admin thanh cong.");
      return;
    }

    const hashedPassword = await bcrypt.hash(saPassword, 10);
    const superAdmin = new UserModel({
      email: saEmail,
      password: hashedPassword,
      displayName: saName,
      role: "superadmin",
      createdAt: new Date(),
      status: "offline",
    });

    await superAdmin.save();
    console.log(`[Backend Database] Khoi tao tai khoan Super Admin thanh cong: ${saEmail}`);
  } catch (error) {
    console.error("[Backend Database] Loi khi tu dong khoi tao Super Admin:", error);
  }
}

/**
 * Tự động seed danh sách mã quyền hệ thống ban đầu
 */
async function seedPermissions() {
  try {
    const defaultPermissions = [
      {
        code: "user:read",
        name: "Xem thong tin nguoi dung",
        module: "user",
        description: "Xem danh sach tai khoan va thong tin nguoi dung trong doanh nghiep",
      },
      {
        code: "user:manage",
        name: "Quan tri nguoi dung",
        module: "user",
        description: "Them, sua, xoa tai khoan thanh vien va cau hinh phan quyen",
      },
      {
        code: "crm:read",
        name: "Xem CRM Ticket",
        module: "crm",
        description: "Xem danh sach va chi tiet cac co hoi ban hang CRM",
      },
      {
        code: "crm:manage",
        name: "Quan tri CRM Ticket",
        module: "crm",
        description: "Them, sua, cap nhat trang thai, xoa co hoi ban hang CRM",
      },
      {
        code: "marketing:post",
        name: "Dang bai va lien ket MXH",
        module: "marketing",
        description: "Dang bai Facebook/TikTok, lien ket tai khoan mang xa hoi va van hanh content marketing",
      },
    ];

    for (const perm of defaultPermissions) {
      const existing = await PermissionModel.findOne({ code: perm.code });
      if (!existing) {
        await new PermissionModel(perm).save();
        console.log(`[Backend Database] Khoi tao ma quyen mac dinh: ${perm.code}`);
      }
    }
  } catch (error) {
    console.error("[Backend Database] Loi khi tu dong khoi tao ma quyen:", error);
  }
}

/**
 * Khởi tạo kết nối cơ sở dữ liệu MongoDB
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://mongodb/igen-marketing";
  const user = process.env.MONGODB_USER;
  const pass = process.env.MONGODB_PASSWORD;
  const authSource = process.env.MONGODB_AUTH_SOURCE || "admin";

  let connectionUri = uri;
  if (user && pass) {
    const protocol = uri.startsWith("mongodb+srv://") ? "mongodb+srv://" : "mongodb://";
    const uriWithoutProtocol = uri.replace(protocol, "");

    if (!uriWithoutProtocol.includes("@")) {
      connectionUri = `${protocol}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${uriWithoutProtocol}`;
    }

    if (authSource && !connectionUri.includes("authSource=")) {
      const separator = connectionUri.includes("?") ? "&" : "?";
      connectionUri = `${connectionUri}${separator}authSource=${authSource}`;
    }
  }

  const redactedUri = connectionUri.replace(/:([^:@]+)@/, ":******@");
  console.log(`[Backend Database] Dang ket noi toi MongoDB qua URI: ${redactedUri}`);

  try {
    await mongoose.connect(connectionUri);
    console.log(
      `[Backend Database] Ket noi MongoDB thanh cong. db=${mongoose.connection.name || "unknown"} host=${mongoose.connection.host || "unknown"} instance=${process.env.INSTANCE_ID || process.env.HOSTNAME || "local"} pid=${process.pid}`
    );
    await seedSuperAdmin();
    await seedPermissions();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("ENOTFOUND mongodb") || connectionUri.includes("@mongodb/") || connectionUri.includes("//mongodb/")) {
      const fallbackUriWithAuth = connectionUri.replace("@mongodb/", "@127.0.0.1/").replace("//mongodb/", "//127.0.0.1/");
      const redactedFallback = fallbackUriWithAuth.replace(/:([^:@]+)@/, ":******@");
      console.log(`[Backend Database] Khong tim thấy host 'mongodb' (chay ngoai Docker). Thu lai voi 127.0.0.1: ${redactedFallback}`);
      try {
        await mongoose.connect(fallbackUriWithAuth);
        console.log(
          `[Backend Database] Ket noi MongoDB local (127.0.0.1) thanh cong! db=${mongoose.connection.name || "unknown"} host=${mongoose.connection.host || "unknown"}`
        );
        await seedSuperAdmin();
        await seedPermissions();
        return;
      } catch {
        console.log("[Backend Database] Ket noi voi auth 127.0.0.1 khong thanh cong. Thu ket noi 127.0.0.1 local (khong auth)...");
        try {
          const noAuthUri = "mongodb://127.0.0.1:27017/igen-marketing";
          await mongoose.connect(noAuthUri);
          console.log(
            `[Backend Database] Ket noi MongoDB local 127.0.0.1 (non-auth) thanh cong! db=${mongoose.connection.name || "unknown"}`
          );
          await seedSuperAdmin();
          await seedPermissions();
          return;
        } catch (noAuthErr) {
          console.error("[Backend Database] Loi ket noi MongoDB fallback 127.0.0.1 (non-auth):", noAuthErr);
        }
      }
    }
    console.error("[Backend Database] Loi ket noi MongoDB:", error);
    process.exit(1);
  }
}
