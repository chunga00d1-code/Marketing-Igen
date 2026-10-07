type CompanyIntegration = {
  companyCode?: string;
  aiAutoReplyConfig?: { enabled?: boolean };
};

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
