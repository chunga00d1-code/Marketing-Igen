async function getHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = localStorage.getItem("accessToken");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function handleErrorResponse(response: Response, defaultError: string): Promise<never> {
  const data = await response.json().catch(() => ({}));
  throw new Error((data as any).message || defaultError);
}

export interface KlingMotionControlParams {
  imageUrl: string;
  videoUrl: string;
  modelName?: string;
  mode?: "std" | "pro";
  prompt?: string;
  characterOrientation?: "video" | "image";
  keepOriginalSound?: boolean;
  videoDuration?: number;
}

export const klingApi = {
  async createMotionControl(
    params: KlingMotionControlParams
  ): Promise<{ status: string; url: string; taskId: string; record: any }> {
    const headers = await getHeaders();
    const response = await fetch("/api/v1/kling/motion-control", {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      await handleErrorResponse(response, "Lỗi tạo Kling Motion Control video");
    }
    return response.json();
  },
};
