/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Helper tự ��"ng �ính kèm companyCode vào b�" lọc truy vấn dữ li�!u (Mongoose filter)
 * giúp cô lập tài nguyên giữa các công ty m�"t cách an toàn.
 *
 * @param filter B�" lọc truy vấn ban �ầu
 * @param user Thông tin người dùng hi�!n tại từ token
 */
export function applyCompanyFilter(
  filter: any = {},
  user?: { role: string; companyCode?: string }
): any {
  if (!user) {
    return filter;
  }

  // Superadmin có quyền xem toàn b�" h�! th�ng hoặc lọc theo ch�0 ��9nh
  if (user.role === "superadmin") {
    return filter;
  }

  // Các vai trò khác bắt bu�"c phải lọc theo mã công ty của mình
  return {
    ...filter,
    companyCode: user.companyCode,
  };
}
