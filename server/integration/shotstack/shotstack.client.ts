import type {
  ShotstackEnvironment,
  ShotstackEdit,
  ShotstackRenderRequest,
  ShotstackRenderStatus,
  ShotstackTemplate,
  ShotstackTemplateSummary,
} from "./shotstack.types";

const SHOTSTACK_BASE_URLS: Record<ShotstackEnvironment, string> = {
  stage: "https://api.shotstack.io/stage",
  v1: "https://api.shotstack.io/v1",
};
const REQUEST_TIMEOUT_MS = 30_000;

export class ShotstackUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShotstackUnavailableError";
  }
}

export class ShotstackProviderError extends Error {
  public readonly status?: number;
  public readonly code?: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "ShotstackProviderError";
    this.status = options.status;
    this.code = options.code;
  }
}

export function getShotstackConfig(): {
  environment: ShotstackEnvironment;
  baseUrl: string;
  apiKey: string;
} {
  const configuredEnvironment = process.env.SHOTSTACK_ENV?.trim();
  const environment = configuredEnvironment || "stage";
  if (environment !== "stage" && environment !== "v1") {
    throw new ShotstackUnavailableError("SHOTSTACK_ENV must be either stage or v1.");
  }

  const apiKey = process.env.SHOTSTACK_API_KEY?.trim();
  if (!apiKey) {
    throw new ShotstackUnavailableError("SHOTSTACK_API_KEY is required to use Shotstack.");
  }

  return { environment, baseUrl: SHOTSTACK_BASE_URLS[environment], apiKey };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function providerMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const message = payload.message ?? payload.error;
  return requiredString(message) ? message : undefined;
}

function providerCode(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const code = payload.code ?? payload.errorCode;
  return requiredString(code) ? code : undefined;
}

function requireSuccessEnvelope(payload: unknown, apiKey: string, status?: number): Record<string, unknown> {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.response)) {
    throw new ShotstackProviderError(
      redactApiKey(providerMessage(payload) || "Shotstack returned an invalid response envelope.", apiKey),
      { status, code: redactApiKey(providerCode(payload) || "", apiKey) || undefined }
    );
  }
  return payload.response;
}

function redactApiKey(message: string, apiKey: string): string {
  return message.split(apiKey).join("[REDACTED]");
}

export class ShotstackClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config = getShotstackConfig()) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
  }

  public async listTemplates(): Promise<ShotstackTemplateSummary[]> {
    const response = await this.request("/templates");
    const envelope = requireSuccessEnvelope(response.payload, this.apiKey, response.status);
    const templates = envelope.templates;
    if (!Array.isArray(templates) || templates.some((template) => !isRecord(template) || !requiredString(template.id))) {
      throw new ShotstackProviderError("Shotstack returned an invalid templates response.", { status: response.status });
    }
    return templates as ShotstackTemplateSummary[];
  }

  public async getTemplate(id: string): Promise<ShotstackTemplate> {
    const response = await this.request(`/templates/${encodeURIComponent(id)}`);
    const template = requireSuccessEnvelope(response.payload, this.apiKey, response.status);
    if (!requiredString(template.id)) {
      throw new ShotstackProviderError("Shotstack returned a template without an ID.", { status: response.status });
    }
    return template as ShotstackTemplate;
  }

  public async renderTemplate(input: ShotstackRenderRequest): Promise<{ renderId: string }> {
    const { templateId, ...renderInput } = input;
    const response = await this.request(`/templates/${encodeURIComponent(templateId)}/render`, {
      method: "POST",
      body: JSON.stringify(renderInput),
    });
    const render = requireSuccessEnvelope(response.payload, this.apiKey, response.status);
    if (!requiredString(render.id)) {
      throw new ShotstackProviderError("Shotstack returned a render without an ID.", { status: response.status });
    }
    return { renderId: render.id };
  }

  public async renderEdit(edit: ShotstackEdit): Promise<{ renderId: string }> {
    const response = await this.request("/render", {
      method: "POST",
      body: JSON.stringify(edit),
    });
    const render = requireSuccessEnvelope(response.payload, this.apiKey, response.status);
    if (!requiredString(render.id)) {
      throw new ShotstackProviderError("Shotstack returned a render without an ID.", { status: response.status });
    }
    return { renderId: render.id };
  }

  public async getRender(renderId: string): Promise<ShotstackRenderStatus> {
    const response = await this.request(`/render/${encodeURIComponent(renderId)}`);
    const render = requireSuccessEnvelope(response.payload, this.apiKey, response.status);
    if (!requiredString(render.id) || !requiredString(render.status)) {
      throw new ShotstackProviderError("Shotstack returned an invalid render status.", { status: response.status });
    }
    return render as ShotstackRenderStatus;
  }

  private async request(path: string, init: RequestInit = {}): Promise<{ payload: unknown; status: number }> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          "x-api-key": this.apiKey,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown network error";
      throw new ShotstackProviderError(
        `Shotstack request failed: ${redactApiKey(message, this.apiKey)}`
      );
    }

    const payload = await this.parseJson(response);
    if (!response.ok) {
      throw new ShotstackProviderError(
        redactApiKey(providerMessage(payload) || `Shotstack returned HTTP ${response.status}.`, this.apiKey),
        { status: response.status, code: redactApiKey(providerCode(payload) || "", this.apiKey) || undefined }
      );
    }
    return { payload, status: response.status };
  }

  private async parseJson(response: Response): Promise<unknown> {
    let body: string;
    try {
      body = await response.text();
    } catch {
      throw new ShotstackProviderError(`Shotstack returned an unreadable response (HTTP ${response.status}).`, {
        status: response.status,
      });
    }

    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new ShotstackProviderError(`Shotstack returned invalid JSON (HTTP ${response.status}).`, {
        status: response.status,
      });
    }
  }
}
