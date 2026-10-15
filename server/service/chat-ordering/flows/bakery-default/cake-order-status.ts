import { MessengerOrderModel } from "../../../../model/messenger-order.model";
import { SocialIntegrationModel } from "../../../../model/social-integration.model";
import { googleOrderSheetService, parseGoogleSpreadsheetId } from "../../../google-order-sheet.service";

interface CakeOrderStatusScope {
  companyCode: string;
  pageId: string;
  conversationId: string;
  orderId: string;
}

export async function lookupCakeOrderStatus(scope: CakeOrderStatusScope) {
  const order = await MessengerOrderModel.findOne({
    orderId: scope.orderId,
    companyCode: scope.companyCode,
    pageId: scope.pageId,
    conversationId: scope.conversationId,
    checkoutFlow: "cake_deposit",
    confirmedAt: { $exists: true },
  }).select("integrationId").lean();
  if (!order) return { kind: "unavailable" as const };

  const integration = await SocialIntegrationModel.findOne({
    _id: order.integrationId,
    companyCode: scope.companyCode,
    username: scope.pageId,
    platform: "Facebook",
    isConnected: true,
  }).select("orderSheetConfig").lean();
  const config = integration?.orderSheetConfig;
  if (!config?.enabled || (!config.spreadsheetId && !config.spreadsheetUrl)) return { kind: "unavailable" as const };

  const spreadsheetId = config.spreadsheetId || parseGoogleSpreadsheetId(config.spreadsheetUrl);
  const result = await googleOrderSheetService.getOrderStatus(
    spreadsheetId,
    config.ordersSheetName || "Orders",
    scope.orderId,
  );
  if (!result.hasStatusColumn) return { kind: "unavailable" as const };
  return result.status ? { kind: "found" as const, status: result.status } : { kind: "empty" as const };
}
