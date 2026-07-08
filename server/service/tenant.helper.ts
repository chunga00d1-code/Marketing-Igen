/**
 * Helper tự động đính kèm companyCode vào bộ lọc truy vấn dữ liệu (Mongoose filter)
 * giúp cô lập tài nguyên giữa các công ty một cách an toàn.
 *
 * @param filter Bộ lọc truy vấn ban đầu
 * @param user Thông tin người dùng hiện tại từ token
 */
export function applyCompanyFilter(
  filter: any = {},
  user?: { role: string; companyCode?: string }
): any {
  if (!user) {
    return filter;
  }

  // Superadmin có quyền xem toàn bộ hệ thống hoặc lọc theo chỉ định
  if (user.role === "superadmin") {
    return filter;
  }

  // Các vai trò khác bắt buộc phải lọc theo mã công ty của mình
  return {
    ...filter,
    companyCode: user.companyCode,
  };
}
