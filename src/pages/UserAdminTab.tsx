import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { authService } from "../services/authService";
import { CompanyProfile, UserProfile } from "../types";
import { toast } from "./Toast";
import { Shield, RefreshCw, Plus, User, X, Wallet, Mail, Lock, SlidersHorizontal } from "lucide-react";
import { parseFirebaseError } from "../utils/firebaseErrorParser";
import { rolePermissionService, RolePermission, Permission } from "../services/rolePermissionService";
import { AdminTransactionInfo, AdminUserBalance, walletService } from "../services/walletService";
import { CompanyModal } from "../components/user-admin/CompanyModal";
import { UserAdminHeader } from "../components/user-admin/UserAdminHeader";
import { UserAdminTabs } from "../components/user-admin/UserAdminTabs";
import { UserFiltersBar } from "../components/user-admin/UserFiltersBar";
import { UserListTable } from "../components/user-admin/UserListTable";
import { CompanyEditFormState, CompanyFormState } from "../components/user-admin/types";
import { UserFormModal } from "../components/user-admin/UserFormModal";
import { BalanceModal } from "../components/user-admin/BalanceModal";
import { RoleModal } from "../components/user-admin/RoleModal";
import { HeyGenModal } from "../components/user-admin/HeyGenModal";

export default function UserAdminTab() {
  const { userProfile } = useAuth();
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // SaaS States
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [selectedCompanyCode, setSelectedCompanyCode] = useState<string>("all");

  // Advanced Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [userPage, setUserPage] = useState(1);
  const USERS_PER_PAGE = 8;
  
  // Register Company Modal States
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [submittingCompany, setSubmittingCompany] = useState(false);
  const [isEditCompanyModalOpen, setIsEditCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyEditFormState | null>(null);

  // Register User Modal States
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userDisplayName, setUserDisplayName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<string>("user");
  const [userCompanyCode, setUserCompanyCode] = useState<string>("");
  const [userParentId, setUserParentId] = useState<string>("");
  const [userDepartment, setUserDepartment] = useState("");
  const [userHeyGenAvatarIds, setUserHeyGenAvatarIds] = useState("");
  const [userHeyGenVoiceId, setUserHeyGenVoiceId] = useState("");
  const [userHeyGenApiKey, setUserHeyGenApiKey] = useState("");
  const [submittingUser, setSubmittingUser] = useState(false);
  const [isHeyGenModalOpen, setIsHeyGenModalOpen] = useState(false);
  const [editingHeyGenUser, setEditingHeyGenUser] = useState<UserProfile | null>(null);
  const [editingHeyGenAvatarIds, setEditingHeyGenAvatarIds] = useState("");
  const [editingHeyGenVoiceId, setEditingHeyGenVoiceId] = useState("");
  const [editingHeyGenApiKey, setEditingHeyGenApiKey] = useState("");
  const [savingHeyGenAccess, setSavingHeyGenAccess] = useState(false);

  const parseAvatarIdsInput = (value: string) =>
    value
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  const resetUserForm = () => {
    setEditingUser(null);
    setUserDisplayName("");
    setUserEmail("");
    setUserPassword("");
    setUserRole("user");
    setUserParentId("");
    setUserDepartment("");
    setUserHeyGenAvatarIds("");
    setUserHeyGenVoiceId("");
    setUserHeyGenApiKey("");
  };
  const formatAvatarIds = (user?: UserProfile | null) =>
    Array.isArray(user?.heygenAccess?.avatarIds) && user?.heygenAccess?.avatarIds.length > 0
      ? user.heygenAccess.avatarIds.join(", ")
      : (user?.heygenAccess?.avatarId || "-");

  const companyFormState: CompanyFormState = {
    companyName,
    companyCode,
    ownerName,
    ownerEmail,
    ownerPassword,
  };

  // Sub-tabs State
  const [activeTab, setActiveTab] = useState<"users" | "roles" | "balance">("users");
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [balanceUsers, setBalanceUsers] = useState<AdminUserBalance[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [editingBalanceUser, setEditingBalanceUser] = useState<AdminUserBalance | null>(null);
  const [balanceAction, setBalanceAction] = useState<"add" | "subtract">("add");
  const [newBalanceValue, setNewBalanceValue] = useState("");
  const [balanceNote, setBalanceNote] = useState("");
  const [submittingBalance, setSubmittingBalance] = useState(false);
  const [selectedBalanceUserId, setSelectedBalanceUserId] = useState<string>("");
  const [balanceTransactions, setBalanceTransactions] = useState<AdminTransactionInfo[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  // Role Permission States
  const [rolePermissionsList, setRolePermissionsList] = useState<RolePermission[]>([]);
  const [systemPermissions, setSystemPermissions] = useState<Permission[]>([]);
  const [roleLoading, setRoleLoading] = useState(false);

  // Add / Edit Role Modal States
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RolePermission | null>(null);
  const [roleSlug, setRoleSlug] = useState("");
  const [roleDisplayName, setRoleDisplayName] = useState("");
  const [roleLevel, setRoleLevel] = useState<number>(3);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [submittingRole, setSubmittingRole] = useState(false);

  // Initialize company code when modal opens
  useEffect(() => {
    if (isUserModalOpen) {
      if (editingUser?.companyCode) {
        setUserCompanyCode(editingUser.companyCode);
      } else if (userProfile?.role === "admin") {
        setUserCompanyCode(userProfile.companyCode || "");
      } else {
        setUserCompanyCode(selectedCompanyCode === "all" ? "SYSTEM" : selectedCompanyCode);
      }
    }
  }, [editingUser, isUserModalOpen, userProfile, selectedCompanyCode]);

  // Handle parentId based on userRole and userCompanyCode automatically
  useEffect(() => {
    if (isUserModalOpen) {
      if (userRole === "manager") {
        if (userCompanyCode && userCompanyCode !== "SYSTEM") {
          const companyAdmin = usersList.find(
            (u) => u.companyCode === userCompanyCode && u.role === "admin"
          );
          setUserParentId(companyAdmin?.uid || "");
        } else {
          setUserParentId("");
        }
      } else {
        setUserParentId("");
      }
    }
  }, [userRole, userCompanyCode, usersList, isUserModalOpen]);

  // Auto fill department based on manager (parentId) for user role
  useEffect(() => {
    if (isUserModalOpen && userRole === "user" && userParentId) {
      const selectedManager = usersList.find(u => u.uid === userParentId);
      if (selectedManager && selectedManager.department) {
        setUserDepartment(selectedManager.department);
      }
    } else if (isUserModalOpen && userRole === "user" && !userParentId) {
      setUserDepartment("");
    }
  }, [userRole, userParentId, usersList, isUserModalOpen]);

  // Reset userDepartment when modal is closed
  useEffect(() => {
    if (!isUserModalOpen) {
      setUserDepartment("");
      setEditingUser(null);
    }
  }, [isUserModalOpen]);

  // Fetch users list from Firestore
  const fetchUsers = async () => {
    setLoading(true);
    try {
      let data: UserProfile[] = [];
      if (userProfile?.role === "superadmin") {
        data = await authService.getAllUsers();
      } else if (userProfile?.companyCode && userProfile?.companyCode !== "SYSTEM") {
        data = await authService.getUsersByCompany(userProfile.companyCode);
      }
      setUsersList(data);
    } catch (error) {
      console.error("Lấy danh sách user thất bại:", error);
      toast.error("Không thể tải danh sách tài khoản người dùng.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch companies list (Superadmin only)
  const fetchCompanies = async () => {
    if (userProfile?.role !== "superadmin") return;
    try {
      const data = await authService.getAllCompanies();
      setCompanies(data);
    } catch (error) {
      console.error("Lấy danh sách doanh nghiệp thất bại:", error);
    }
  };

  const fetchRolePermissions = async () => {
    setRoleLoading(true);
    try {
      let code = undefined;
      if (userProfile?.role === "superadmin") {
        code = selectedCompanyCode === "all" ? "SYSTEM" : selectedCompanyCode;
      } else {
        code = userProfile?.companyCode;
      }
      const data = await rolePermissionService.getRolePermissions(code);
      setRolePermissionsList(data);
    } catch (error) {
      console.error("Lấy cấu hình vai trò thất bại:", error);
    } finally {
      setRoleLoading(false);
    }
  };

  const fetchSystemPermissions = async () => {
    try {
      const data = await rolePermissionService.getPermissions();
      setSystemPermissions(data);
    } catch (error) {
      console.error("Lấy mã quyền hệ thống thất bại:", error);
    }
  };

  const fetchAdminBalances = async () => {
    if (userProfile?.role !== "superadmin") return;

    setBalanceLoading(true);
    try {
      const companyFilter = selectedCompanyCode === "all" ? undefined : selectedCompanyCode;
      const data = await walletService.getAdminBalances(companyFilter);
      setBalanceUsers(data);
      setSelectedBalanceUserId((prev) => {
        if (!data.length) return "";
        return data.some((item) => item.userId === prev) ? prev : data[0].userId;
      });
    } catch (error) {
      console.error("Lấy danh sách số dư thất bại:", error);
      toast.error("Không thể tải danh sách số dư người dùng.");
    } finally {
      setBalanceLoading(false);
    }
  };

  const fetchAdminTransactions = async (targetUserId: string) => {
    if (!targetUserId) {
      setBalanceTransactions([]);
      return;
    }

    setTransactionsLoading(true);
    try {
      const data = await walletService.getAdminUserTransactions(targetUserId, 20);
      setBalanceTransactions(data);
    } catch (error) {
      console.error("Lấy lịch sử giao dịch thất bại:", error);
      toast.error("Không thể tải lịch sử giao dịch của người dùng.");
    } finally {
      setTransactionsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchCompanies();
    fetchRolePermissions();
    fetchSystemPermissions();
    fetchAdminBalances();
  }, [userProfile?.uid, userProfile?.role, userProfile?.companyCode, selectedCompanyCode]);

  useEffect(() => {
    if (activeTab === "balance" && selectedBalanceUserId) {
      fetchAdminTransactions(selectedBalanceUserId);
    }
  }, [activeTab, selectedBalanceUserId]);

  // Close action menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-action-menu]')) {
        setOpenActionMenuId(null);
      }
    };
    
    if (openActionMenuId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openActionMenuId]);

  useEffect(() => {
    setUserPage(1);
  }, [searchQuery, filterStartDate, filterEndDate, selectedCompanyCode, userProfile?.role]);

  const getAvailableRoles = () => {
    const defaultRoles = [
      { role: "user", displayName: "USER (Nhân viên)", level: 4 },
      { role: "manager", displayName: "MANAGER (Quản lý)", level: 3 }
    ];
    
    if (userProfile?.role === "superadmin") {
      defaultRoles.push(
        { role: "admin", displayName: "ADMIN (Chủ doanh nghiệp)", level: 2 },
        { role: "superadmin", displayName: "SUPERADMIN (Toàn quyền)", level: 1 }
      );
    } else if (userProfile?.role === "admin") {
      defaultRoles.push(
        { role: "admin", displayName: "ADMIN (Chủ doanh nghiệp)", level: 2 }
      );
    }

    // Merge with custom roles
    const customRoles = rolePermissionsList
      .filter(rp => !["user", "manager", "admin", "superadmin"].includes(rp.role))
      .map(rp => ({
        role: rp.role,
        displayName: `${rp.role.toUpperCase()} (${rp.displayName || rp.role})`,
        level: rp.level
      }));

    const allRoles = [...defaultRoles, ...customRoles];
    const callerLevel = userProfile?.role === "superadmin" ? 1 : 2;

    return allRoles.filter(r => r.level >= callerLevel);
  };

  // Filter visible users:
  // - Superadmin: see all, filter by selectedCompanyCode
  // - Admin: see all users in the same company (except superadmins)
  const visibleUsers = usersList.filter((usr) => {
    // 1. Lá»c theo Doanh nghiá»‡p
    if (userProfile?.role === "superadmin") {
      if (selectedCompanyCode !== "all" && usr.companyCode !== selectedCompanyCode) {
        return false;
      }
    } else {
      // Admin only sees users within their company, hiding superadmin accounts
      if (usr.companyCode !== userProfile?.companyCode || usr.role === "superadmin") {
        return false;
      }
    }

    // 2. Lá»c theo TÃªn hoáº·c Email
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const matchName = usr.displayName?.toLowerCase().includes(query);
      const matchEmail = usr.email?.toLowerCase().includes(query);
      if (!matchName && !matchEmail) return false;
    }

    // 3. Lá»c theo NgÃ y Ä‘Äƒng kÃ½ (createdAt)
    if (filterStartDate || filterEndDate) {
      if (!usr.createdAt) return false;
      const userDate = new Date(usr.createdAt);
      userDate.setHours(0, 0, 0, 0);

      if (filterStartDate) {
        const start = new Date(filterStartDate);
        start.setHours(0, 0, 0, 0);
        if (userDate < start) return false;
      }

      if (filterEndDate) {
        const end = new Date(filterEndDate);
        end.setHours(23, 59, 59, 999);
        if (userDate > end) return false;
      }
    }

    return true;
  });

  const balanceByUserId = balanceUsers.reduce<Record<string, AdminUserBalance>>((acc, item) => {
    acc[item.userId] = item;
    return acc;
  }, {});

  const totalUserPages = Math.max(1, Math.ceil(visibleUsers.length / USERS_PER_PAGE));
  const safeUserPage = Math.min(userPage, totalUserPages);
  const paginatedVisibleUsers = visibleUsers.slice(
    (safeUserPage - 1) * USERS_PER_PAGE,
    safeUserPage * USERS_PER_PAGE
  );

  const handleRoleChange = async (targetUid: string, targetName: string, newRole: "user" | "manager" | "admin" | "superadmin") => {
    if (targetUid === userProfile?.uid) {
      toast.warning("Bạn không thể tự thay đổi vai trò của chính mình!");
      return;
    }

    // Admin không được phép nâng cấp lên admin hoặc superadmin — chỉ superadmin mới được
    if (userProfile?.role === "admin" && (newRole === "admin" || newRole === "superadmin")) {
      toast.error("Chủ doanh nghiệp không có quyền cấp vai trò Admin hoặc Superadmin cho tài khoản khác!");
      return;
    }

    try {
      await authService.updateUserRole(targetUid, newRole);
      toast.success(`Đã cập nhật quyền hạn cho "${targetName}" thành ${newRole.toUpperCase()}!`);
      // Cập nhật lại list ở client
      setUsersList((prev) =>
        prev.map((u) => {
          if (u.uid === targetUid) {
            const dept = newRole === "admin" || newRole === "superadmin" ? "Ban Giám đốc" : (newRole === "manager" ? "Quản lý" : "Nhân viên");
            const div = newRole === "admin" || newRole === "superadmin" ? "Ban Giám đốc" : (newRole === "manager" ? "Quản lý" : "Nhân viên");
            const title = newRole === "admin" ? "CEO" : (newRole === "manager" ? "Quản lý phòng ban" : "Nhân viên");
            return { ...u, role: newRole, department: dept, division: div, jobTitle: title };
          }
          return u;
        })
      );
    } catch (error) {
      console.error("Lỗi cập nhật quyền:", error);
      toast.error("Lỗi khi cập nhật quyền hạn người dùng.");
    }
  };

  const handleRegisterCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !companyCode.trim() || !ownerName.trim() || !ownerEmail.trim() || !ownerPassword.trim()) {
      toast.warning("Vui lòng điền đầy đủ thông tin doanh nghiệp và chủ sở hữu!");
      return;
    }
    if (companyCode.trim().length < 2) {
      toast.warning("Mã doanh nghiệp phải có ít nhất 2 ký tự!");
      return;
    }
    if (ownerPassword.length < 6) {
      toast.warning("Mật khẩu của chủ sở hữu phải từ 6 ký tự trở lên!");
      return;
    }

    setSubmittingCompany(true);
    try {
      await authService.registerCompanyAndAdmin(
        companyName,
        companyCode,
        ownerName,
        ownerEmail,
        ownerPassword
      );
      toast.success(`Đăng ký doanh nghiệp ${companyName} và tài khoản Admin thành công!`);
      setIsCompanyModalOpen(false);
      // Reset form
      setCompanyName("");
      setCompanyCode("");
      setOwnerName("");
      setOwnerEmail("");
      setOwnerPassword("");
      // Refresh lists
      await fetchUsers();
      await fetchCompanies();
    } catch (error: any) {
      console.error("Lỗi đăng ký doanh nghiệp:", error);
      const errMsg = parseFirebaseError(error, "Không thể đăng ký doanh nghiệp mới.");
      toast.error(errMsg);
    } finally {
      setSubmittingCompany(false);
    }
  };

  const handleCompanyFormChange = (field: keyof CompanyFormState, value: string) => {
    if (field === "companyName") setCompanyName(value);
    if (field === "companyCode") setCompanyCode(value);
    if (field === "ownerName") setOwnerName(value);
    if (field === "ownerEmail") setOwnerEmail(value);
    if (field === "ownerPassword") setOwnerPassword(value);
  };

  const handleEditCompanyFormChange = (field: keyof CompanyEditFormState, value: string) => {
    setEditingCompany((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const openEditCompanyModal = () => {
    if (userProfile?.role !== "superadmin" || selectedCompanyCode === "all") return;
    const targetCompany = companies.find((company) => company.code === selectedCompanyCode);
    if (!targetCompany) {
      toast.warning("Không tìm thấy doanh nghiệp để chỉnh sửa.");
      return;
    }
    setEditingCompany({
      id: targetCompany.id,
      name: targetCompany.name,
      code: targetCompany.code,
      ownerEmail: targetCompany.ownerEmail,
    });
    setIsEditCompanyModalOpen(true);
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userProfile?.role !== "superadmin" || !editingCompany) {
      toast.error("Chỉ superadmin mới được chỉnh sửa doanh nghiệp.");
      return;
    }

    setSubmittingCompany(true);
    try {
      await authService.updateCompany(editingCompany.id, {
        name: editingCompany.name.trim(),
        code: editingCompany.code.trim(),
        ownerEmail: editingCompany.ownerEmail.trim(),
      });
      toast.success(`Đã cập nhật doanh nghiệp "${editingCompany.name}".`);
      setIsEditCompanyModalOpen(false);
      await fetchCompanies();
      await fetchUsers();
      setSelectedCompanyCode(editingCompany.code.trim().toUpperCase());
    } catch (error: any) {
      console.error("Lỗi cập nhật doanh nghiệp:", error);
      toast.error(parseFirebaseError(error, "Không thể cập nhật doanh nghiệp."));
    } finally {
      setSubmittingCompany(false);
    }
  };

  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userDisplayName.trim() || !userEmail.trim() || !userCompanyCode) {
      toast.warning("Vui lòng điền đầy đủ thông tin người dùng!");
      return;
    }
    if (!editingUser && userPassword.length < 6) {
      toast.warning("Mật khẩu phải từ 6 ký tự trở lên!");
      return;
    }
    if (userProfile?.role === "admin" && userRole === "admin") {
      toast.warning("Chủ doanh nghiệp không được phép tạo tài khoản có vai trò Admin!");
      return;
    }

    setSubmittingUser(true);
    try {
      let compName = "";
      if (userCompanyCode === "SYSTEM") {
        compName = "Hệ thống";
      } else {
        const found = companies.find(c => c.code === userCompanyCode);
        compName = found ? found.name : userCompanyCode;
      }

      // Tìm level của người quản lý để tính level nhân viên mới
      const managerProfile = userParentId ? usersList.find(u => u.uid === userParentId) : null;
      const heygenAccessPayload = {
          avatarIds: parseAvatarIdsInput(userHeyGenAvatarIds),
          avatarId: parseAvatarIdsInput(userHeyGenAvatarIds)[0] || undefined,
          voiceId: userHeyGenVoiceId.trim() || undefined,
          apiKey: userHeyGenApiKey.trim() || undefined,
        };

      if (editingUser) {
        await authService.updateUser(editingUser.uid, {
          displayName: userDisplayName.trim(),
          role: userRole,
          companyCode: userCompanyCode,
          companyName: compName,
          parentId: userParentId || null,
          level: userRole === "user" && managerProfile?.level ? managerProfile.level + 1 : undefined,
          department: userDepartment.trim() || "",
          division: userDepartment.trim() || "",
          phone: editingUser.phone || "",
          heygenAccess: heygenAccessPayload,
        });

        toast.success(`Đã cập nhật tài khoản "${userDisplayName}".`);
      } else {
        await authService.registerUserForCompany(
          userDisplayName,
          userEmail,
          userPassword,
          userRole,
          userCompanyCode,
          compName,
          userParentId || undefined,
          managerProfile?.level,
          userDepartment.trim() || undefined,
          userDepartment.trim() || undefined,
          undefined,
          heygenAccessPayload
        );

        toast.success(`Đăng ký tài khoản cho "${userDisplayName}" thành công!`);
      }
      setIsUserModalOpen(false);
      resetUserForm();
      // Refresh lists
      await fetchUsers();
    } catch (error: any) {
      console.error(editingUser ? "Lỗi cập nhật người dùng:" : "Lỗi đăng ký người dùng:", error);
      const errMsg = parseFirebaseError(
        error,
        editingUser ? "Không thể cập nhật người dùng." : "Không thể đăng ký người dùng mới."
      );
      toast.error(errMsg);
    } finally {
      setSubmittingUser(false);
    }
  };

  const openCreateUserModal = () => {
    resetUserForm();
    setIsUserModalOpen(true);
  };

  const openEditUserModal = (user: UserProfile) => {
    setOpenActionMenuId(null);
    setEditingUser(user);
    setUserDisplayName(user.displayName || "");
    setUserEmail(user.email || "");
    setUserPassword("");
    setUserRole(user.role || "user");
    setUserCompanyCode(user.companyCode || "");
    setUserParentId(user.parentId || "");
    setUserDepartment(user.department || "");
    setUserHeyGenAvatarIds(formatAvatarIds(user) === "-" ? "" : formatAvatarIds(user));
    setUserHeyGenVoiceId(user.heygenAccess?.voiceId || "");
    setUserHeyGenApiKey(user.heygenAccess?.apiKey || "");
    setIsUserModalOpen(true);
  };

  const handleDeleteUser = async (user: UserProfile) => {
    setOpenActionMenuId(null);
    if (user.uid === userProfile?.uid) {
      toast.warning("Bạn không thể tự xóa chính mình.");
      return;
    }

    const accepted = window.confirm(`Xóa người dùng "${user.displayName}"? Thao tác này không thể hoàn tác.`);
    if (!accepted) {
      return;
    }

    try {
      await authService.deleteUser(user.uid);
      setUsersList((prev) => prev.filter((item) => item.uid !== user.uid));
      toast.success(`Đã xóa người dùng "${user.displayName}".`);
    } catch (error: any) {
      console.error("Lỗi xóa người dùng:", error);
      toast.error(error.message || "Không thể xóa người dùng.");
    }
  };

  const openBalanceEditor = (targetUser: AdminUserBalance, action: "add" | "subtract" = "add") => {
    setEditingBalanceUser(targetUser);
    setBalanceAction(action);
    setNewBalanceValue("");
    setBalanceNote("");
    setIsBalanceModalOpen(true);
  };

  const handleSaveBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBalanceUser) return;

    const parsedAmount = Number(newBalanceValue);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.warning("Số tiền điều chỉnh phải lớn hơn 0.");
      return;
    }

    const currentBalance = Number(editingBalanceUser.balance ?? 0);
    const nextBalance =
      balanceAction === "add"
        ? currentBalance + parsedAmount
        : currentBalance - parsedAmount;

    if (nextBalance < 0) {
      toast.warning("Không thể trừ vượt quá số dư hiện tại.");
      return;
    }

    setSubmittingBalance(true);
    try {
      const updated = await walletService.updateUserBalance(
        editingBalanceUser.userId,
        Number(nextBalance.toFixed(2)),
        balanceNote.trim() ||
          `${balanceAction === "add" ? "Cộng" : "Trừ"} ${parsedAmount.toFixed(2)} Credit từ màn hình quản lý user`
      );

      setBalanceUsers((prev) =>
        prev.map((item) =>
          item.userId === updated.userId
            ? { ...item, ...updated }
            : item
        )
      );
      if (selectedBalanceUserId === updated.userId) {
        await fetchAdminTransactions(updated.userId);
      }

      toast.success(
        `${balanceAction === "add" ? "Đã cộng" : "Đã trừ"} ${parsedAmount.toFixed(2)} Credit cho "${updated.displayName}".`
      );
      setIsBalanceModalOpen(false);
      setEditingBalanceUser(null);
      setBalanceNote("");
      setNewBalanceValue("");
    } catch (error: any) {
      console.error("Lỗi cập nhật số dư:", error);
      toast.error(error.message || "Không thể cập nhật số dư người dùng.");
    } finally {
      setSubmittingBalance(false);
    }
  };

  const closeBalanceModal = () => {
    setIsBalanceModalOpen(false);
    setEditingBalanceUser(null);
    setBalanceAction("add");
    setNewBalanceValue("");
    setBalanceNote("");
  };

  const openHeyGenEditor = (user: UserProfile) => {
    setOpenActionMenuId(null);
    setEditingHeyGenUser(user);
    setEditingHeyGenAvatarIds(
      Array.isArray(user.heygenAccess?.avatarIds) && user.heygenAccess?.avatarIds.length > 0
        ? user.heygenAccess.avatarIds.join(", ")
        : (user.heygenAccess?.avatarId || "")
    );
    setEditingHeyGenVoiceId(user.heygenAccess?.voiceId || "");
    setEditingHeyGenApiKey(user.heygenAccess?.apiKey || "");
    setIsHeyGenModalOpen(true);
  };

  const handleSaveHeyGenAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHeyGenUser) {
      return;
    }

    setSavingHeyGenAccess(true);
    try {
      const avatarIds = parseAvatarIdsInput(editingHeyGenAvatarIds);
      await authService.updateUser(editingHeyGenUser.uid, {
        heygenAccess: {
          avatarIds,
          avatarId: avatarIds[0] || "",
          voiceId: editingHeyGenVoiceId.trim(),
          apiKey: editingHeyGenApiKey.trim(),
        },
      });

      setUsersList((prev) =>
        prev.map((user) =>
          user.uid === editingHeyGenUser.uid
            ? {
                ...user,
                heygenAccess: {
                  avatarIds,
                  avatarId: avatarIds[0] || "",
                  voiceId: editingHeyGenVoiceId.trim(),
                  apiKey: editingHeyGenApiKey.trim(),
                },
              }
            : user
        )
      );

      toast.success(`Đã cập nhật cấu hình HeyGen cho "${editingHeyGenUser.displayName}".`);
      setIsHeyGenModalOpen(false);
      setEditingHeyGenUser(null);
    } catch (error: any) {
      console.error("Lỗi cập nhật HeyGen access:", error);
      toast.error(error.message || "Không thể cập nhật cấu hình HeyGen cho người dùng này.");
    } finally {
      setSavingHeyGenAccess(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white max-h-[85vh] overflow-hidden" id="user_admin_tab_wrapper">
      <h1 className="sr-only">Quản trị Hệ thống & Phân quyền - {activeTab}</h1>
      
      <UserAdminHeader
        userProfile={userProfile}
        companies={companies}
        selectedCompanyCode={selectedCompanyCode}
        onSelectedCompanyCodeChange={setSelectedCompanyCode}
        onOpenCompanyModal={() => setIsCompanyModalOpen(true)}
        onOpenCreateUserModal={openCreateUserModal}
        onRefresh={fetchUsers}
        loading={loading}
      />

      <UserAdminTabs activeTab={activeTab} onChange={setActiveTab} userProfile={userProfile} />
      {activeTab === "users" ? (
        <>
          <UserFiltersBar
            searchQuery={searchQuery}
            filterStartDate={filterStartDate}
            filterEndDate={filterEndDate}
            visibleUsersCount={visibleUsers.length}
            totalUsersCount={usersList.length}
            onSearchChange={setSearchQuery}
            onFilterStartDateChange={setFilterStartDate}
            onFilterEndDateChange={setFilterEndDate}
            onClear={() => {
              setSearchQuery("");
              setFilterStartDate("");
              setFilterEndDate("");
            }}
          />
          {/* Main List Area */}
          <div className="flex-1 p-6 overflow-y-auto" id="user_admin_content">
            {loading ? (
              <div className="h-48 flex flex-col items-center justify-center text-center">
                <RefreshCw className="h-8 w-8 text-indigo-650 animate-spin mb-3" />
                <span className="text-xs font-bold font-mono text-indigo-800 uppercase tracking-widest">Đang tải danh sách tài khoản...</span>
              </div>
            ) : visibleUsers.length === 0 ? (
              <div className="p-12 text-center bg-gray-50 text-gray-400 italic rounded-2xl border border-dashed">
                Không tìm thấy tài khoản nào trong hệ thống!
              </div>
            ) : (
              <UserListTable
                users={paginatedVisibleUsers}
                currentUser={userProfile}
                rolePermissionsList={rolePermissionsList}
                balanceByUserId={balanceByUserId}
                userPage={safeUserPage}
                totalUserPages={totalUserPages}
                onPageChange={setUserPage}
                getAvailableRoles={getAvailableRoles}
                onRoleChange={handleRoleChange}
                openActionMenuId={openActionMenuId}
                onToggleActionMenu={(uid) => setOpenActionMenuId(openActionMenuId === uid ? null : uid)}
                onEditUser={openEditUserModal}
                onDeleteUser={handleDeleteUser}
                onOpenBalance={(usr) => {
                  setSelectedBalanceUserId(usr.uid);
                  openBalanceEditor(
                    balanceByUserId[usr.uid] || {
                      userId: usr.uid,
                      displayName: usr.displayName,
                      email: usr.email,
                      role: usr.role,
                      companyCode: usr.companyCode || "",
                      companyName: usr.companyName || "",
                      balance: 0,
                      currency: "Credit",
                    },
                    "add"
                  );
                }}
                setActiveTab={setActiveTab}
              />
            )}
          </div>
        </>      ) : activeTab === "balance" ? (
        <div className="flex-1 p-6 overflow-y-auto space-y-6" id="user_balance_tab_content">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-gray-50 p-4 rounded-2xl border border-gray-150 gap-4">
            <div>
              <h5 className="font-bold text-slate-800 text-sm">Quản lý số dư người dùng</h5>
              <p className="text-xs text-gray-500 mt-0.5">Chỉ superadmin mới được chỉnh sửa balance của người dùng.</p>
            </div>
            <button
              type="button"
              onClick={fetchAdminBalances}
              disabled={balanceLoading}
              className="p-2 px-3.5 bg-white hover:bg-slate-100 border border-gray-205 rounded-xl text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${balanceLoading ? "animate-spin" : ""}`} />
              Tải lại số dư
            </button>
          </div>

          {balanceLoading ? (
            <div className="h-48 flex flex-col items-center justify-center text-center">
              <RefreshCw className="h-8 w-8 text-indigo-650 animate-spin mb-3" />
              <span className="text-xs font-bold font-mono text-indigo-800 uppercase tracking-widest">Đang tải dữ liệu số dư...</span>
            </div>
          ) : balanceUsers.length === 0 ? (
            <div className="p-12 text-center bg-gray-50 text-gray-400 italic rounded-2xl border border-dashed">
              Chưa có người dùng nào để điều chỉnh số dư.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.95fr)] gap-6">
              <div className="bg-white border border-gray-150 rounded-2xl shadow-xs max-w-full" style={{ overflow: 'clip' }}>
                <div className="max-w-full overflow-x-auto overscroll-x-contain">
                <table className="w-full min-w-[1280px] text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-150 text-[10px] font-bold text-gray-400 font-mono uppercase tracking-wider">
                      <th className="p-4 pl-6">Người dùng</th>
                      <th className="p-4">Doanh nghiệp</th>
                      <th className="p-4">Vai trò</th>
                      <th className="p-4">Số dư</th>
                      <th className="p-4">Cập nhật</th>
                      <th className="p-4 pr-6 text-center">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-slate-700">
                    {balanceUsers.map((item) => {
                      const isSelected = item.userId === selectedBalanceUserId;
                      return (
                        <tr
                          key={item.userId}
                          className={`transition-colors ${isSelected ? "bg-emerald-50/60" : "hover:bg-slate-50/40"}`}
                        >
                          <td className="p-4 pl-6 cursor-pointer" onClick={() => setSelectedBalanceUserId(item.userId)}>
                            <div>
                              <div className="font-semibold text-slate-800">{item.displayName}</div>
                              <div className="text-[11px] text-gray-500 font-mono">{item.email}</div>
                            </div>
                          </td>
                          <td className="p-4 cursor-pointer" onClick={() => setSelectedBalanceUserId(item.userId)}>
                            <div className="font-semibold text-slate-700">{item.companyName || "Há»‡ thá»‘ng"}</div>
                            <div className="text-[10px] text-gray-400 font-mono">{item.companyCode || "SYSTEM"}</div>
                          </td>
                          <td className="p-4">
                            <span className="px-2.5 py-0.75 rounded-full font-bold font-mono text-[9px] uppercase tracking-wider inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-700">
                              <Shield className="h-3 w-3" />
                              {item.role}
                            </span>
                          </td>
                          <td className="p-4 min-w-[170px]">
                            <div className="font-bold text-emerald-700">{new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(item.balance || 0)} Credit</div>
                            <div className="mt-1 text-[10px] text-gray-400 font-mono">{item.currency}</div>
                          </td>
                          <td className="p-4 text-gray-500 font-mono">
                            {item.updatedAt ? new Date(item.updatedAt).toLocaleString("vi-VN") : "-"}
                          </td>
                          <td className="p-4 pr-6">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBalanceUserId(item.userId);
                                  setActiveTab("balance");
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50"
                              >
                                Xem chi tiết
                              </button>
                              <button
                                type="button"
                                onClick={() => openBalanceEditor(item, "add")}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100"
                              >
                                Điều chỉnh
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[11px] font-mono text-slate-500">
                    Trang {safeUserPage} / {totalUserPages}  ‹ {paginatedVisibleUsers.length} / {visibleUsers.length} tài khoản hiển thị
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUserPage((prev) => Math.max(1, prev - 1))}
                      disabled={safeUserPage === 1}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Trang trước 
                    </button>
                    {Array.from({ length: totalUserPages }, (_, index) => index + 1)
                      .slice(Math.max(0, safeUserPage - 3), Math.min(totalUserPages, safeUserPage + 2))
                      .map((page) => (
                        <button
                          key={page}
                          type="button"
                          onClick={() => setUserPage(page)}
                          className={`h-9 min-w-9 rounded-xl px-3 text-[11px] font-bold transition ${
                            page === safeUserPage
                              ? "bg-slate-900 text-white"
                              : "border border-gray-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setUserPage((prev) => Math.min(totalUserPages, prev + 1))}
                      disabled={safeUserPage === totalUserPages}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Trang sau
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-150 rounded-2xl shadow-xs p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h6 className="font-bold text-slate-800 text-sm">Lịch sử giao dịch</h6>
                    <p className="text-xs text-gray-500 mt-1">
                      {balanceUsers.find((item) => item.userId === selectedBalanceUserId)?.displayName || "Chọn người dùng"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchAdminTransactions(selectedBalanceUserId)}
                    disabled={!selectedBalanceUserId || transactionsLoading}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${transactionsLoading ? "animate-spin" : ""}`} />
                    Tải lại
                  </button>
                </div>

                {transactionsLoading ? (
                  <div className="h-48 flex items-center justify-center text-center">
                    <RefreshCw className="h-6 w-6 text-emerald-600 animate-spin" />
                  </div>
                ) : balanceTransactions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-xs text-gray-500">
                    Chưa có giao dịch nào cho tài khoản này.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                    {balanceTransactions.map((transaction) => (
                      <div key={transaction._id} className="rounded-2xl border border-gray-150 p-3.5 bg-gray-50/60">
                        <div className="flex items-center justify-between gap-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase ${
                            transaction.type === "deposit"
                              ? "bg-emerald-100 text-emerald-800"
                              : transaction.type === "withdraw"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-200 text-slate-700"
                          }`}>
                            {transaction.type}
                          </span>
                          <span className="font-bold text-slate-800">{new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(transaction.amount || 0)} Credit</span>
                        </div>
                        <div className="mt-2 text-[11px] text-gray-500 font-mono">
                          {new Date(transaction.createdAt).toLocaleString("vi-VN")}
                        </div>
                        <div className="mt-2 text-xs text-slate-600 leading-5">
                          {transaction.description || "Không có mô tả giao dịch."}
                        </div>
                        <div className="mt-2 text-[10px] text-gray-400 font-mono">
                          Order: {transaction.orderCode} · Status: {transaction.status}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 p-6 overflow-y-auto space-y-6" id="roles_permissions_tab_content">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-gray-50 p-4 rounded-2xl border border-gray-150 gap-4">
            <div>
              <h5 className="font-bold text-slate-800 text-sm">Danh sách vai trò & Cấu hình phân quyền</h5>
              <p className="text-xs text-gray-500 mt-0.5">Tạo vai trò tùy chỉnh và thiết lập danh sách quyền tương ứng cho nhân sự.</p>
            </div>
            <button
              onClick={() => {
                setEditingRole(null);
                setRoleSlug("");
                setRoleDisplayName("");
                setRoleLevel(3);
                setSelectedPermissions([]);
                setIsRoleModalOpen(true);
              }}
              className="p-2 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 text-center justify-center"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm vai trò tùy chỉnh
            </button>
          </div>

          {roleLoading ? (
            <div className="h-48 flex flex-col items-center justify-center text-center">
              <RefreshCw className="h-8 w-8 text-indigo-650 animate-spin mb-3" />
              <span className="text-xs font-bold font-mono text-indigo-800 uppercase tracking-widest">Đang tải danh sách vai trò...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Render Default roles and Custom roles */}
              {(() => {
                const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
                  admin: ["*"],
                  manager: [
                    "user:read", "user:manage",
                    "crm:read", "crm:manage",
                    "marketing:post"
                  ],
                  user: [
                    "user:read",
                    "crm:read",
                    "marketing:post"
                  ]
                };

                const defaultRolesList = [
                  { role: "admin", displayName: "ADMIN (Chủ doanh nghiệp)", level: 2, isDefault: true, permissions: DEFAULT_ROLE_PERMISSIONS.admin },
                  { role: "manager", displayName: "MANAGER (Quản lý)", level: 3, isDefault: true, permissions: DEFAULT_ROLE_PERMISSIONS.manager },
                  { role: "user", displayName: "USER (Nhân viên)", level: 4, isDefault: true, permissions: DEFAULT_ROLE_PERMISSIONS.user }
                ];
                
                const customRolesList = rolePermissionsList.filter(rp => !["superadmin", "admin", "manager", "user"].includes(rp.role));
                
                const rolesToDisplay = [
                  ...defaultRolesList.map(dr => {
                    const dbRecord = rolePermissionsList.find(rp => rp.role === dr.role);
                    return {
                      ...dr,
                      permissions: dbRecord ? dbRecord.permissions : (DEFAULT_ROLE_PERMISSIONS[dr.role] || []),
                      displayName: dbRecord?.displayName || dr.displayName,
                      level: dbRecord?.level || dr.level,
                      _id: dbRecord?._id
                    };
                  }),
                  ...customRolesList.map(cr => ({
                    role: cr.role,
                    displayName: cr.displayName || cr.role.toUpperCase(),
                    level: cr.level,
                    permissions: cr.permissions,
                    isDefault: false,
                    _id: cr._id
                  }))
                ];

                return rolesToDisplay.map((roleInfo) => {
                  return (
                    <div key={roleInfo.role} className="bg-white border border-gray-150 hover:border-indigo-200 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-[9px] font-bold font-mono tracking-wider">
                              LEVEL {userProfile?.role === "superadmin" ? roleInfo.level : roleInfo.level - 1}
                            </span>
                            <h6 className="font-bold text-slate-800 text-sm mt-1">{roleInfo.displayName}</h6>
                            <span className="text-[10px] text-gray-400 font-mono block">Mã: {roleInfo.role}</span>
                          </div>
                          {roleInfo.isDefault && (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-150 rounded-sm text-[8px] font-bold font-mono">
                              MẶC ĐỊNH
                            </span>
                          )}
                        </div>

                        {/* Permissions display */}
                        <div className="space-y-1 text-left">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Mã quyền cấp phép:</span>
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                            {roleInfo.permissions.length === 0 ? (
                              <span className="text-[10px] text-gray-450 italic">Chưa cấu hình quyền nào</span>
                            ) : roleInfo.permissions.includes("*") ? (
                              <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-150 rounded text-[9px] font-semibold font-mono">
                                * (Tất cả quyền)
                              </span>
                            ) : (
                              roleInfo.permissions.map(p => (
                                <span key={p} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-150 rounded text-[9px] font-semibold font-mono" title={systemPermissions.find(sp => sp.code === p)?.name || p}>
                                  {p}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="border-t border-gray-100 pt-3 flex justify-end gap-2 mt-auto">
                        {roleInfo.role !== "admin" && (
                          <button
                            onClick={() => {
                              setEditingRole(roleInfo as any);
                              setRoleSlug(roleInfo.role);
                              setRoleDisplayName(roleInfo.displayName);
                              setRoleLevel(roleInfo.level);
                              setSelectedPermissions(roleInfo.permissions);
                              setIsRoleModalOpen(true);
                            }}
                            className="p-1.5 px-3 bg-white hover:bg-slate-100 border border-gray-205 rounded-xl text-[10px] font-bold text-slate-700 cursor-pointer transition-all active:scale-95 flex items-center gap-1"
                          >
                            Thiết lập phân quyền
                          </button>
                        )}
                        {!roleInfo.isDefault && (
                          <button
                            onClick={async () => {
                              if (window.confirm(`Bạn có chắc chắn muốn xóa vai trò "${roleInfo.displayName}"? Hành động này sẽ bỏ phân quyền vai trò.`)) {
                                try {
                                  let code = undefined;
                                  if (userProfile?.role === "superadmin") {
                                    code = selectedCompanyCode === "all" ? "SYSTEM" : selectedCompanyCode;
                                  } else {
                                    code = userProfile?.companyCode;
                                  }
                                  await rolePermissionService.deleteRolePermission(roleInfo.role, code);
                                  toast.success("Xóa cấu hình vai trò thành công!");
                                  await fetchRolePermissions();
                                } catch (error: any) {
                                  console.error(error);
                                  toast.error(error.message || "Xóa vai trò thất bại.");
                                }
                              }
                            }}
                            className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl text-[10px] font-bold text-red-650 cursor-pointer transition-all active:scale-95"
                            title="Xóa vai trò"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}

      <CompanyModal
        mode="create"
        open={isCompanyModalOpen}
        form={companyFormState}
        submitting={submittingCompany}
        onClose={() => setIsCompanyModalOpen(false)}
        onChange={(field, value) => handleCompanyFormChange(field as keyof CompanyFormState, value)}
        onSubmit={handleRegisterCompany}
      />

      <CompanyModal
        mode="edit"
        open={isEditCompanyModalOpen && !!editingCompany}
        form={editingCompany || { id: "", name: "", code: "", ownerEmail: "" }}
        submitting={submittingCompany}
        onClose={() => setIsEditCompanyModalOpen(false)}
        onChange={(field, value) => handleEditCompanyFormChange(field as keyof CompanyEditFormState, value)}
        onSubmit={handleUpdateCompany}
      />

      <UserFormModal
        open={isUserModalOpen}
        onClose={() => {
          setIsUserModalOpen(false);
          resetUserForm();
        }}
        editingUser={editingUser}
        userDisplayName={userDisplayName}
        setUserDisplayName={setUserDisplayName}
        userEmail={userEmail}
        setUserEmail={setUserEmail}
        userPassword={userPassword}
        setUserPassword={setUserPassword}
        userRole={userRole}
        setUserRole={setUserRole}
        userCompanyCode={userCompanyCode}
        setUserCompanyCode={setUserCompanyCode}
        userParentId={userParentId}
        setUserParentId={setUserParentId}
        userDepartment={userDepartment}
        setUserDepartment={setUserDepartment}
        userHeyGenAvatarIds={userHeyGenAvatarIds}
        setUserHeyGenAvatarIds={setUserHeyGenAvatarIds}
        userHeyGenVoiceId={userHeyGenVoiceId}
        setUserHeyGenVoiceId={setUserHeyGenVoiceId}
        userHeyGenApiKey={userHeyGenApiKey}
        setUserHeyGenApiKey={setUserHeyGenApiKey}
        getAvailableRoles={getAvailableRoles}
        userProfile={userProfile}
        companies={companies}
        usersList={usersList}
        onSubmit={handleRegisterUser}
        submittingUser={submittingUser}
        parseAvatarIdsInput={parseAvatarIdsInput}
      />

      <BalanceModal
        open={isBalanceModalOpen}
        onClose={closeBalanceModal}
        editingBalanceUser={editingBalanceUser}
        balanceAction={balanceAction}
        setBalanceAction={setBalanceAction}
        newBalanceValue={newBalanceValue}
        setNewBalanceValue={setNewBalanceValue}
        balanceNote={balanceNote}
        setBalanceNote={setBalanceNote}
        submittingBalance={submittingBalance}
        onSubmit={handleSaveBalance}
      />

      <RoleModal
        open={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        editingRole={editingRole}
        roleSlug={roleSlug}
        setRoleSlug={setRoleSlug}
        roleDisplayName={roleDisplayName}
        setRoleDisplayName={setRoleDisplayName}
        roleLevel={roleLevel}
        setRoleLevel={setRoleLevel}
        selectedPermissions={selectedPermissions}
        setSelectedPermissions={setSelectedPermissions}
        userProfile={userProfile}
        selectedCompanyCode={selectedCompanyCode}
        systemPermissions={systemPermissions}
        submittingRole={submittingRole}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!roleSlug.trim() || !roleDisplayName.trim()) {
            toast.warning("Vui lòng nhập đầy đủ thông tin vai trò!");
            return;
          }

          setSubmittingRole(true);
          try {
            let code = undefined;
            if (userProfile?.role === "superadmin") {
              code = selectedCompanyCode === "all" ? "SYSTEM" : selectedCompanyCode;
            } else {
              code = userProfile?.companyCode;
            }

            const payload = {
              role: roleSlug.toLowerCase().trim(),
              displayName: roleDisplayName.trim(),
              level: roleLevel,
              permissions: selectedPermissions,
              companyCode: code,
            };

            await rolePermissionService.saveRolePermission(payload);
            toast.success(editingRole ? "Cập nhật vai trò thành công!" : "Tạo vai trò mới thành công!");
            setIsRoleModalOpen(false);
            await fetchRolePermissions();
          } catch (error) {
            console.error(error);
            toast.error(error.message || "Không thể cập nhật cấu hình vai trò.");
          } finally {
            setSubmittingRole(false);
          }
        }}
      />

      <HeyGenModal
        open={isHeyGenModalOpen}
        onClose={() => {
          setIsHeyGenModalOpen(false);
          setEditingHeyGenUser(null);
        }}
        editingHeyGenUser={editingHeyGenUser}
        editingHeyGenAvatarIds={editingHeyGenAvatarIds}
        setEditingHeyGenAvatarIds={setEditingHeyGenAvatarIds}
        editingHeyGenVoiceId={editingHeyGenVoiceId}
        setEditingHeyGenVoiceId={setEditingHeyGenVoiceId}
        editingHeyGenApiKey={editingHeyGenApiKey}
        setEditingHeyGenApiKey={setEditingHeyGenApiKey}
        savingHeyGenAccess={savingHeyGenAccess}
        onSubmit={handleSaveHeyGenAccess}
      />
    </div>
  );
}
