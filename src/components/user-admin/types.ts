import { AdminUserBalance } from "../../services/walletService";
import { RolePermission } from "../../services/rolePermissionService";
import { CompanyHeyGenConfig, CompanyProfile, UserProfile } from "../../types";

export type UserAdminTabKey = "users" | "roles" | "balance";

export interface UserFormState {
  displayName: string;
  email: string;
  password: string;
  role: string;
  companyCode: string;
  parentId: string;
  department: string;
}

export interface UserTableProps {
  users: UserProfile[];
  currentUser?: UserProfile | null;
  rolePermissionsList: RolePermission[];
  balanceByUserId: Record<string, AdminUserBalance>;
  userPage: number;
  totalUserPages: number;
  onPageChange: (page: number | ((prev: number) => number)) => void;
  getAvailableRoles: () => Array<{ role: string; displayName: string; level: number }>;
  onRoleChange: (uid: string, name: string, role: any) => void;
  openActionMenuId: string | null;
  onToggleActionMenu: (uid: string) => void;
  onEditUser: (user: UserProfile) => void;
  onDeleteUser: (user: UserProfile) => void;
  onOpenBalance: (user: UserProfile, balance?: AdminUserBalance) => void;
  setActiveTab: (tab: UserAdminTabKey) => void;
}

export interface CompanyFormState {
  companyName: string;
  companyCode: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}

export interface CompanyEditFormState {
  id: string;
  name: string;
  code: string;
  ownerEmail: string;
  heygenConfig: CompanyHeyGenConfig;
}
