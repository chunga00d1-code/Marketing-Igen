/* eslint-disable @typescript-eslint/no-explicit-any */
export type SupportedModelName =
  | "products"
  | "categories"
  | "crm-tickets"
  | "marketing-contents"
  | "social-integrations"
  | "users";

export interface ICRUDQueryOptions {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
  filters?: Record<string, any>;
}
