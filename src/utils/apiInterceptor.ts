const originalFetch = window.fetch;
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

window.fetch = async function (input, init) {
  // 1. Perform the original request
  let response = await originalFetch(input, init);

  // 2. Check if the response indicates unauthorized/token expired (401)
  if (response.status === 401) {
    const urlString = typeof input === "string" ? input : (input as Request).url;

    // Avoid infinite loop if the refresh-token or login/register endpoint itself fails with 401
    if (
      urlString.includes("/auth/refresh-token") ||
      urlString.includes("/auth/login") ||
      urlString.includes("/auth/register")
    ) {
      return response;
    }

    // If already refreshing, wait for it to complete and retry with the new token
    if (isRefreshing) {
      return new Promise((resolve) => {
        subscribeTokenRefresh((newToken) => {
          const newInit = { ...init };
          if (newInit.headers) {
            const headers = new Headers(newInit.headers);
            headers.set("Authorization", `Bearer ${newToken}`);
            newInit.headers = headers;
          } else {
            newInit.headers = {
              "Authorization": `Bearer ${newToken}`,
            };
          }
          resolve(originalFetch(input, newInit));
        });
      });
    }

    isRefreshing = true;

    try {
      // Call refresh token API (refresh token is sent as HttpOnly cookie automatically)
      const refreshRes = await originalFetch("/api/v1/auth/refresh-token", {
        method: "POST",
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        const newToken = refreshData.accessToken;

        if (newToken) {
          localStorage.setItem("accessToken", newToken);

          // Retry the original request with the new token
          const newInit = { ...init };
          if (newInit.headers) {
            const headers = new Headers(newInit.headers);
            headers.set("Authorization", `Bearer ${newToken}`);
            newInit.headers = headers;
          } else {
            newInit.headers = {
              "Authorization": `Bearer ${newToken}`,
            };
          }

          // Notify all pending subscribers
          onRefreshed(newToken);
          isRefreshing = false;

          return originalFetch(input, newInit);
        }
      }
      
      // Refresh token failed or is invalid/expired. Force logout by clearing token and reloading.
      localStorage.removeItem("accessToken");
      window.location.reload();
    } catch (err) {
      console.error("Lỗi tự động làm mới token:", err);
    } finally {
      isRefreshing = false;
    }
  }

  return response;
};
