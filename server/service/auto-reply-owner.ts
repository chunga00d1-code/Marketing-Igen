type CompanyIntegration = {
  companyCode?: string;
  aiAutoReplyConfig?: { enabled?: boolean };
};

type ReplyRuleOwner = {
  _id?: { toString(): string };
  email?: string;
  companyCode?: string;
  aiAutoReplyConfig?: { advancedInstructions?: string } | null;
};

/** Inherit only rules from the account that owns this Page, never an arbitrary company member. */
export function inheritPageReplyRules<T extends { advancedInstructions?: string }>(
  pageConfig: T,
  integration: { companyCode?: string; createdBy?: string },
  companyUsers: readonly ReplyRuleOwner[],
  directOwners: readonly ReplyRuleOwner[] = [],
): T {
  if (typeof pageConfig.advancedInstructions === "string" && pageConfig.advancedInstructions.trim()) return pageConfig;
  const companyCode = String(integration.companyCode || "").trim().toUpperCase();
  if (!companyCode) return pageConfig;
  const sameCompany = (user: ReplyRuleOwner) => String(user.companyCode || "").trim().toUpperCase() === companyCode;
  const creator = String(integration.createdBy || "").trim().toLowerCase();
  const creators = creator ? companyUsers.filter(user => sameCompany(user)
    && (String(user._id || "").toLowerCase() === creator || String(user.email || "").trim().toLowerCase() === creator)) : [];
  const owners = creators.length ? creators : directOwners.filter(sameCompany);
  if (owners.length !== 1) return pageConfig;
  const rules = owners[0].aiAutoReplyConfig?.advancedInstructions;
  return typeof rules === "string" && rules.trim() ? { ...pageConfig, advancedInstructions: rules } : pageConfig;
}

export class AmbiguousAutoReplyOwnerError extends Error {
  readonly code = "AMBIGUOUS_AUTO_REPLY_OWNER";
  readonly status = 409;

  constructor() {
    super("Kênh đang liên kết với nhiều doanh nghiệp. Cần xác định một doanh nghiệp sở hữu trước khi bật AI trả lời.");
  }
}

/** A webhook identifies the channel account, not the tenant. Never guess its owner. */
export function selectAutoReplyCompanyIntegration<T extends CompanyIntegration>(integrations: T[]): T | null {
  const companies = new Set(integrations.map((item) => String(item.companyCode || "").trim().toUpperCase()));
  if (companies.size > 1) throw new AmbiguousAutoReplyOwnerError();
  if (!integrations.length) return null;
  if (!companies.has("")) {
    return integrations.find((item) => item.aiAutoReplyConfig?.enabled === true) || integrations[0];
  }
  throw new AmbiguousAutoReplyOwnerError();
}

export function assertPersonalAutoReplyOwnership(owners: Array<{ companyCode?: string; role?: string }>): void {
  const companies = new Set(owners.map(item =>
    String(item.companyCode || (item.role === "superadmin" ? "SYSTEM" : "")).trim().toUpperCase()
  ));
  if (companies.size > 1 || (owners.length > 1 && companies.has(""))) {
    throw new AmbiguousAutoReplyOwnerError();
  }
}
