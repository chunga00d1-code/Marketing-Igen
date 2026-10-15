import { SocialIntegrationModel } from "../../model/social-integration.model";
import type { ChatOrderFlow } from "./core/types";
import { bakeryDefaultFlow } from "./flows/bakery-default";

const FLOW_MODULES: ReadonlyMap<string, ChatOrderFlow> = new Map([
  [bakeryDefaultFlow.key, bakeryDefaultFlow],
]);

// Assign company codes to a flow key when adding a company-specific module.
const COMPANY_FLOW_ASSIGNMENTS: Readonly<Record<string, string>> = Object.freeze({
  // COMPANY_CODE: "company-flow-key",
});

const DEFAULT_FLOW_KEY = bakeryDefaultFlow.key;

function normalizedCompanyCode(companyCode?: string | null) {
  return String(companyCode || "").trim().toUpperCase();
}

function resolveFlow(companyCode?: string | null) {
  const companyKey = normalizedCompanyCode(companyCode);
  const selectedKey = COMPANY_FLOW_ASSIGNMENTS[companyKey] || DEFAULT_FLOW_KEY;
  return FLOW_MODULES.get(selectedKey) || bakeryDefaultFlow;
}

export const chatOrderFlowRegistry = {
  resolve: resolveFlow,

  async resolveForPage(pageId: string) {
    const integration = await SocialIntegrationModel.findOne({ platform: "Facebook", username: pageId })
      .select("companyCode")
      .lean();
    return resolveFlow(integration?.companyCode);
  },
};
