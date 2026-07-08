import { getAccessToken } from "./authService";

export interface RolePermission {
  _id?: string;
  companyCode: string;
  role: string;
  permissions: string[];
  level: number;
  displayName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Permission {
  _id: string;
  code: string;
  name: string;
  module: string;
  description?: string;
}

export const ALLOWED_PERMISSION_CODES = [
  "user:read",
  "user:manage",
  "crm:read",
  "crm:manage",
  "marketing:post",
] as const;

const ALLOWED_PERMISSION_CODE_SET = new Set<string>(ALLOWED_PERMISSION_CODES);
const ALLOWED_PERMISSION_MODULE_SET = new Set<string>(["user", "crm", "marketing"]);

function filterPermissionCodes(permissionCodes: string[] = []) {
  return permissionCodes.filter((code) => code === "*" || ALLOWED_PERMISSION_CODE_SET.has(code));
}

function filterPermissionRecords(permissions: Permission[] = []) {
  return permissions.filter(
    (permission) =>
      ALLOWED_PERMISSION_CODE_SET.has(permission.code) &&
      ALLOWED_PERMISSION_MODULE_SET.has(permission.module)
  );
}

function sanitizeRolePermission(rolePermission: RolePermission): RolePermission {
  return {
    ...rolePermission,
    permissions: filterPermissionCodes(rolePermission.permissions),
  };
}

export const rolePermissionService = {
  async getRolePermissions(companyCode?: string): Promise<RolePermission[]> {
    const queryParams = companyCode ? `?companyCode=${encodeURIComponent(companyCode)}` : "";
    const res = await fetch(`/api/v1/role-permissions${queryParams}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Khong the lay danh sach cau hinh vai tro.");
    }

    const result = await res.json();
    return (result.data || []).map(sanitizeRolePermission);
  },

  async saveRolePermission(roleData: {
    role: string;
    level: number;
    permissions: string[];
    displayName?: string;
    companyCode?: string;
  }): Promise<RolePermission> {
    const sanitizedPayload = {
      ...roleData,
      permissions: filterPermissionCodes(roleData.permissions),
    };

    const res = await fetch("/api/v1/role-permissions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(sanitizedPayload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Khong the cap nhat cau hinh vai tro.");
    }

    const result = await res.json();
    return sanitizeRolePermission(result.data);
  },

  async deleteRolePermission(role: string, companyCode?: string): Promise<void> {
    const queryParams = companyCode ? `?companyCode=${encodeURIComponent(companyCode)}` : "";
    const res = await fetch(`/api/v1/role-permissions/${encodeURIComponent(role)}${queryParams}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Khong the xoa cau hinh vai tro.");
    }
  },

  async getPermissions(): Promise<Permission[]> {
    const res = await fetch("/api/v1/permissions?limit=100", {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Khong the lay danh sach quyen he thong.");
    }

    const result = await res.json();
    return filterPermissionRecords(result.data || []);
  },
};
