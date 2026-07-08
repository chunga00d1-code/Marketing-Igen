import { RolePermissionModel } from "../model/role-permission.model";
import { IRolePermission } from "../interface/role-permission.interface";

export const rolePermissionService = {
  /**
   * Tạo mới hoặc cập nhật phân quyền của một vai trò tại doanh nghiệp
   */
  async saveRolePermission(data: any): Promise<IRolePermission> {
    const { companyCode, role, permissions, level, displayName } = data;
    const normalizedCompany = companyCode.toUpperCase().trim();

    let rolePermission = await RolePermissionModel.findOne({
      companyCode: normalizedCompany,
      role,
    });

    if (rolePermission) {
      rolePermission.permissions = permissions;
      rolePermission.level = level;
      rolePermission.displayName = displayName;
      rolePermission.updatedAt = new Date();
    } else {
      rolePermission = new RolePermissionModel({
        companyCode: normalizedCompany,
        role,
        permissions,
        level,
        displayName,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return await rolePermission.save();
  },

  /**
   * Lấy danh sách cấu hình phân quyền vai trò (phân trang và bộ lọc)
   */
  async getRolePermissions(
    filter: any = {},
    pagination: { page?: number; limit?: number } = {}
  ): Promise<{ data: IRolePermission[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, pagination.page || 1);
    const limit = Math.max(1, pagination.limit || 20);
    const skip = (page - 1) * limit;

    const total = await RolePermissionModel.countDocuments(filter);
    const data = await RolePermissionModel.find(filter)
      .sort({ companyCode: 1, role: 1 })
      .skip(skip)
      .limit(limit);

    return { data, total, page, limit };
  },

  /**
   * Lấy cấu hình chi tiết của vai trò tại một công ty
   */
  async getRolePermission(companyCode: string, role: string): Promise<IRolePermission | null> {
    return await RolePermissionModel.findOne({
      companyCode: companyCode.toUpperCase().trim(),
      role,
    });
  },

  /**
   * Xóa cấu hình vai trò
   */
  async deleteRolePermission(companyCode: string, role: string): Promise<void> {
    const result = await RolePermissionModel.deleteOne({
      companyCode: companyCode.toUpperCase().trim(),
      role,
    });

    if (result.deletedCount === 0) {
      throw new Error("Không tìm thấy cấu hình phân quyền vai trò để xóa.");
    }
  }
};
