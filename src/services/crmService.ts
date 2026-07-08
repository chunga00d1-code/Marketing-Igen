import { getAccessToken } from "./authService";
import { LeadCard } from "../types";

export interface LeadProductSelection {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface ExtendedLeadCard extends LeadCard {
  lastInteractionTime?: string;
  createdAt?: any;
  updatedAt?: any;
  selectedProducts?: LeadProductSelection[];
}

function logCrmTiming(
  operation: "subscribe" | "create" | "update" | "delete" | "bulkUpdate",
  startedAt: number,
  details?: Record<string, unknown>
) {
  const durationMs = Date.now() - startedAt;
  console.info(`[CRM:${operation}]`, {
    durationMs,
    ...details,
  });
}

// Central cache state for crmService to optimize performance
let cachedLeads: ExtendedLeadCard[] = [];
let listeners: Array<{
  callback: (leads: ExtendedLeadCard[]) => void;
  onError?: (error: unknown) => void;
}> = [];
let pollInterval: ReturnType<typeof setInterval> | null = null;
let isFirstFetchDone = false;
let activeGetLeadsPromise: Promise<ExtendedLeadCard[]> | null = null;

const triggerListeners = (data: ExtendedLeadCard[]) => {
  listeners.forEach((listener) => {
    try {
      listener.callback(data);
    } catch (err) {
      console.error("[crmService] Error in listener callback:", err);
    }
  });
};

const triggerListenersError = (err: unknown) => {
  listeners.forEach((listener) => {
    if (listener.onError) {
      try {
        listener.onError(err);
      } catch (e) {
        console.error("[crmService] Error in listener error callback:", e);
      }
    }
  });
};

const fetchLeadsInternal = async () => {
  try {
    const data = await crmService.getLeads();
    // Only trigger listener callback if data changed (prevent deep re-renders and blinking)
    const dataStr = JSON.stringify(data);
    const cachedStr = JSON.stringify(cachedLeads);
    if (!isFirstFetchDone || dataStr !== cachedStr) {
      cachedLeads = data;
      isFirstFetchDone = true;
      triggerListeners(data);
    }
  } catch (err) {
    triggerListenersError(err);
  }
};

export const crmService = {
  getLeads(): Promise<ExtendedLeadCard[]> {
    if (activeGetLeadsPromise) {
      return activeGetLeadsPromise;
    }

    activeGetLeadsPromise = (async () => {
      try {
        const res = await fetch("/api/v1/crud/crm-tickets", {
          headers: {
            "Authorization": `Bearer ${getAccessToken()}`,
          },
        });
        if (!res.ok) {
          throw new Error("Không thể tải danh sách cơ hội bán hàng.");
        }
        const json = await res.json();
        return (json.data || []).map((item: any) => ({
          ...item,
          id: item._id, // Bản đồ MongoDB _id sang id
        }));
      } finally {
        activeGetLeadsPromise = null;
      }
    })();

    return activeGetLeadsPromise;
  },

  subscribeLeads(callback: (leads: ExtendedLeadCard[]) => void, onError?: (error: unknown) => void) {
    const listener = { callback, onError };
    listeners.push(listener);

    // If cache is ready, emit immediately to avoid visual lag
    if (isFirstFetchDone) {
      callback(cachedLeads);
    } else {
      fetchLeadsInternal();
    }

    if (!pollInterval) {
      // Use single centralized interval to poll database
      pollInterval = setInterval(fetchLeadsInternal, 5000);
    }

    return () => {
      listeners = listeners.filter((l) => l !== listener);
      if (listeners.length === 0 && pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
        isFirstFetchDone = false;
      }
    };
  },

  async createLead(lead: Omit<ExtendedLeadCard, "id">): Promise<string> {
    const startedAt = Date.now();
    const tempId = `temp-${Date.now()}`;

    // 1. Instantly update UI with a temporary ID (0ms lag!)
    const createdLead: ExtendedLeadCard = { ...lead, id: tempId };
    const oldLeads = [...cachedLeads];
    cachedLeads = [...cachedLeads, createdLead];
    triggerListeners(cachedLeads);

    try {
      const res = await fetch("/api/v1/crud/crm-tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({
          ...lead,
          createdAt: Date.now(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Tạo cơ hội bán hàng thất bại.");
      }

      const json = await res.json();
      const realId = json.data._id;
      logCrmTiming("create", startedAt, { id: realId });

      // 2. Swap temporary ID with real ID in the cache
      cachedLeads = cachedLeads.map((item) =>
        item.id === tempId ? { ...item, id: realId } : item
      );
      triggerListeners(cachedLeads);

      // Re-sync background cache
      fetchLeadsInternal();
      return realId;
    } catch (err) {
      // Rollback optimistic update on error
      cachedLeads = oldLeads;
      triggerListeners(cachedLeads);
      throw err;
    }
  },

  async updateLead(id: string, lead: Partial<ExtendedLeadCard>): Promise<void> {
    const startedAt = Date.now();
    
    // 1. Optimistic Update (Immediate 120fps feel in Kanban DnD drag & drop)
    const oldLeads = [...cachedLeads];
    cachedLeads = cachedLeads.map((item) =>
      item.id === id ? { ...item, ...lead } : item
    );
    triggerListeners(cachedLeads);

    const res = await fetch(`/api/v1/crud/crm-tickets/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({
        ...lead,
        updatedAt: Date.now(),
      }),
    });

    if (!res.ok) {
      // Rollback optimistic update on error
      cachedLeads = oldLeads;
      triggerListeners(cachedLeads);
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Cập nhật cơ hội bán hàng thất bại.");
    }

    logCrmTiming("update", startedAt, { id, fields: Object.keys(lead) });
    
    // Background fetch to sync any server-computed fields
    fetchLeadsInternal();
  },

  async deleteLead(id: string): Promise<void> {
    const startedAt = Date.now();

    // 1. Optimistic UI update
    const oldLeads = [...cachedLeads];
    cachedLeads = cachedLeads.filter((item) => item.id !== id);
    triggerListeners(cachedLeads);

    const res = await fetch(`/api/v1/crud/crm-tickets/${id}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      // Rollback on error
      cachedLeads = oldLeads;
      triggerListeners(cachedLeads);
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Xóa cơ hội bán hàng thất bại.");
    }

    logCrmTiming("delete", startedAt, { id });
    fetchLeadsInternal();
  },

  async bulkUpdateLeads(updates: Array<{ id: string; lead: Partial<ExtendedLeadCard> }>): Promise<void> {
    const startedAt = Date.now();
    if (updates.length === 0) return;

    // 1. Optimistic UI update
    const oldLeads = [...cachedLeads];
    cachedLeads = cachedLeads.map((item) => {
      const update = updates.find((u) => u.id === item.id);
      return update ? { ...item, ...update.lead } : item;
    });
    triggerListeners(cachedLeads);

    try {
      await Promise.all(
        updates.map(({ id, lead }) =>
          fetch(`/api/v1/crud/crm-tickets/${id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${getAccessToken()}`,
            },
            body: JSON.stringify({
              ...lead,
              updatedAt: Date.now(),
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.message || "Cập nhật thất bại.");
            }
          })
        )
      );
    } catch (err) {
      // Rollback on error
      cachedLeads = oldLeads;
      triggerListeners(cachedLeads);
      throw err;
    }

    logCrmTiming("bulkUpdate", startedAt, {
      count: updates.length,
      ids: updates.map(({ id }) => id),
    });

    fetchLeadsInternal();
  },
};
