# Prompt-to-HTML Video Draft Design

## Goal

Extend the existing HTML-to-video workspace so an authenticated user can describe
a video in a natural-language prompt, receive an editable HTML/CSS animation
draft, review it in the existing safe preview, adjust the source if needed, and
explicitly start the existing video render.

The feature adds AI-assisted source generation before the current preview and
render workflow. It does not replace or automatically invoke the render workflow.

## Current State

The existing HTML-to-video flow is:

1. The user enters HTML and CSS.
2. The client sends the source and output settings to the safe-preview endpoint.
3. The server validates and wraps the source in a server-owned composition.
4. The user explicitly starts a background render.
5. The client polls the existing render until it completes or fails.

There is no prompt-to-HTML generation step today. The repository does have an AI
HTML generator for creative images, backed by `AI_HTML_MODEL` and wallet
charging. The video feature should reuse the same low-level AI and billing
infrastructure, but it needs its own video-specific prompt, response parser, and
API boundary.

## Scope

### Included

- One natural-language prompt field in the HTML-to-video workspace.
- AI generation of separate `html` and `css` draft values.
- Generation based on the selected duration, aspect ratio, and resolution.
- A dedicated authenticated draft-generation API.
- Use of `AI_HTML_MODEL`.
- The existing `API_COSTS.AI_HTML_CHAT` wallet price.
- Server-side parsing, validation, and HTML-video security checks before a draft
  reaches the client.
- Automatic population of the existing HTML/CSS editors after successful
  generation.
- Existing debounced safe preview after the editors are populated.
- Manual editing and an explicit render action after generation.
- Confirmation before a later AI generation overwrites user-edited source.
- Focused frontend, API, service, parser, wallet, and security tests.

### Excluded

- Automatic rendering after AI generation.
- JavaScript or inline event handlers.
- Images, logos, uploads, remote URLs, external fonts, or other external assets.
- `iframe`, form, navigation, plugin, SVG, or MathML support.
- CSS `url(...)` or `@import`.
- Persisting an AI draft as an `HtmlVideoRender` record before the user renders.
- Multi-turn AI editing or conversation history.
- Automated campaign integration.
- Changes to the current preview, render queue, renderer, polling, or output
  contracts.

## User Experience

Add a section titled **Tạo thiết kế bằng AI** above the existing HTML and CSS
editors.

The section contains:

- A multiline prompt field.
- A visible **0.5 credit/lần tạo** wallet cost label, matching the configured
  `API_COSTS.AI_HTML_CHAT` amount.
- A primary **Tạo HTML/CSS bằng AI** action.
- A local loading state and a local, safe error message area.

The prompt is not submitted by pressing Enter. Generation starts only from the
button so a newline or accidental key press cannot incur a wallet charge.

The request uses the current duration, aspect ratio, and resolution controls.
Those controls remain the single source of truth; the AI section does not
duplicate them.

On success:

1. The returned HTML replaces the HTML editor value.
2. The returned CSS replaces the CSS editor value.
3. The existing debounced preview runs normally.
4. The prompt remains available for refinement.
5. The generation action is labeled **Tạo lại bằng AI**.

The user may then edit either source field and explicitly select **Kết xuất
video**. AI generation never submits a render.

The workspace tracks whether the source was changed after the latest successful
AI generation. If a later generation would replace user-edited source, the user
must confirm the overwrite first. Cancelling keeps the prompt and source
unchanged and does not call the API. Initial default example source may be
replaced without confirmation because it is not user-authored.

While generation is active, only the generation action is disabled. Existing
source and render state are not cleared. A generation failure preserves both
editors and any valid preview.

## API Contract

Add an authenticated endpoint:

`POST /api/v1/html-video-renders/generate-draft`

Request:

```json
{
  "prompt": "Tạo video giới thiệu khóa học AI, phong cách công nghệ, tiêu đề xuất hiện từ dưới lên.",
  "durationSeconds": 8,
  "aspectRatio": "9:16",
  "resolution": "1080p"
}
```

Successful response:

```json
{
  "success": true,
  "data": {
    "html": "<main class=\"hero\">...</main>",
    "css": ".hero { ... } @keyframes enter { ... }"
  }
}
```

The response deliberately excludes a full document and preview HTML. The
existing preview endpoint remains responsible for building the server-owned
composition document.

The endpoint uses the existing authentication middleware and derives both user
and company scope from the authenticated request. It does not accept tenant or
user identifiers from the body.

## Input Validation

- `prompt` is required, normalized for surrounding whitespace, and limited to
  4,000 characters.
- A whitespace-only prompt is invalid.
- `durationSeconds` remains an integer from 1 through 60.
- `aspectRatio` remains one of `16:9`, `9:16`, or `1:1`.
- `resolution` remains `720p` or `1080p`.
- Unknown fields are rejected according to the repository's existing Joi
  request-validation behavior.
- Existing Vietnamese validation conventions are preserved.

The same 4,000-character limit must be used by the Joi schema, service
normalization, frontend `maxLength`, and tests.

## AI Generation

Create a video-specific draft-generation service instead of calling the
creative-image project API.

The service:

1. Normalizes the request.
2. Checks the authenticated user's wallet balance for
   `API_COSTS.AI_HTML_CHAT`.
3. Calls the shared OpenRouter text infrastructure with
   `process.env.AI_HTML_MODEL || "google/gemini-2.5-flash"`.
4. Requires JSON output matching `{ "html": "string", "css": "string" }`.
5. Parses and bounds both strings.
6. Passes the generated source and requested settings through
   `buildSafeHtmlVideoComposition`.
7. Deducts `API_COSTS.AI_HTML_CHAT` exactly once only after all validation and
   security checks succeed.
8. Returns only the validated source values.

The system prompt tells the model:

- Produce one composition for the exact target dimensions and duration.
- Return a structural HTML fragment separately from CSS.
- Use semantic HTML, gradients, CSS shapes, typography, and CSS keyframe
  animation.
- Keep important content inside a safe margin and maintain readable contrast.
- Ensure the final animation state remains visible through the requested
  duration.
- Do not invent prices, discounts, claims, URLs, or factual product details not
  supplied by the user.
- Do not emit JavaScript, markdown fences, full-document tags, style tags,
  external assets, network-loading CSS, or unsupported elements.

The service makes at most one internal retry for malformed JSON or rejected
generated source. Both attempts belong to one user action and must never cause
an additional wallet deduction.

## Security

AI output is untrusted input. Model instructions are quality guidance, not the
security boundary.

Before returning a draft, the server runs the existing
`buildSafeHtmlVideoComposition` validator with the generated `html`, `css`, and
requested output settings. This preserves the current restrictions, including
rejection of:

- Scripts and inline event handlers.
- Embedded styles in the HTML fragment.
- Iframes, objects, embeds, forms, base tags, meta tags, SVG, and MathML.
- URL-bearing HTML attributes.
- `@import`, `url(...)`, `expression(...)`, `javascript:`, and
  `-moz-binding` in CSS.
- Oversized HTML or CSS.

The generated full composition is discarded after validation because the
existing preview endpoint must rebuild it from the editor state. This ensures
manual edits are checked by the same trust boundary and avoids creating a
second preview contract.

Prompts and full generated source are not written to application logs. Provider
errors are sanitized and bounded before logging or returning a user-facing
message. Secrets, provider payloads, stack traces, filesystem paths, and raw
HTML/CSS are never returned in error responses.

## Wallet Semantics

- Balance is checked before the provider call.
- A successful action deducts exactly `API_COSTS.AI_HTML_CHAT`.
- A provider failure, timeout, malformed response, unsafe response, or cancelled
  client confirmation does not deduct funds.
- Internal retries belong to the original action and do not create additional
  charges.
- If deduction fails after a valid provider result, the endpoint returns an
  error and does not return the draft. The implementation must use the same
  wallet error handling and audit behavior as the existing AI HTML flow.
- Repeated user-initiated clicks are separate billable actions. The frontend
  disables duplicate clicks while one request is active.

## Components and Responsibilities

### Backend

- Extend the HTML-video request schemas with a dedicated draft-generation
  schema.
- Add a controller method that resolves the authenticated actor and delegates
  to the generation service.
- Add the route before `/:renderId` so the literal path cannot be interpreted as
  a render identifier.
- Add a focused AI draft service responsible for prompting, parsing, security
  validation, and billing.
- Reuse the existing HTML-video actor scoping and security service.
- Reuse the low-level OpenRouter and wallet services without coupling the
  feature to creative-image project persistence.

### Frontend

- Extend `htmlVideoRenderService` with strict request and response types plus a
  `generateDraft` method.
- Keep prompt, generation loading, generation error, latest generated source,
  and dirty-after-generation state local to `HtmlVideoWorkspace`.
- Populate the current editor state on success so the existing preview effect
  remains unchanged.
- Preserve current render submission, idempotency, polling, and result behavior.
- Use `window.confirm`, which is already used by existing repository workflows,
  with a Vietnamese warning that creating again will replace the current
  user-edited HTML and CSS.

## Error Handling

The UI distinguishes these safe outcomes:

- Insufficient wallet balance.
- AI service unavailable or timed out.
- AI returned an invalid or unsafe draft.
- General generation failure.

All errors remain inside the AI generation section and preserve existing editor,
preview, and render state. A failed generation can be retried as a new
user-initiated action.

The endpoint uses the repository-standard response envelope. Authentication,
validation, wallet, provider, and unsafe-output failures map to stable,
user-facing messages without exposing internal details.

## Testing

### Backend tests

- Accept a valid prompt and supported output settings.
- Reject empty, whitespace-only, oversized, and unknown-field input.
- Reject unsupported duration, aspect ratio, or resolution.
- Parse a valid `{ html, css }` provider result.
- Reject markdown-wrapped, malformed, missing-field, empty, or oversized
  provider output.
- Reject generated scripts, event handlers, remote URLs, CSS `url()`, and other
  content blocked by the existing security service.
- Check balance before provider invocation.
- Deduct exactly once after a valid safe result.
- Do not deduct on provider, parser, security, or retry failure.
- Keep one charge when an internal retry succeeds.
- Scope the actor using authenticated user and company data.
- Return only `{ html, css }`.

### Frontend tests

- Render the prompt field, visible cost, and generation action.
- Send prompt plus the current duration, aspect ratio, and resolution.
- Disable duplicate generation while a request is active.
- Populate both editors after success and allow the existing preview to update.
- Preserve the prompt after success.
- Preserve current editor and preview state after failure.
- Do not call the API when overwrite confirmation is cancelled.
- Require confirmation only after the user edits a generated draft.
- Preserve the existing explicit render behavior and never render on generation
  success.

### Verification

Run the focused backend and frontend tests, followed by:

- `npm run typecheck`
- `npm run build`

Lint may also be run for changed files or repository-wide if the current
worktree state makes that signal reliable. A manual smoke test should verify a
prompt-to-preview flow and confirm that render creation remains a separate
click.

## Delivery Sequence

1. Add failing backend tests for validation, parsing, security, wallet behavior,
   and the API contract.
2. Implement the dedicated schema, service, controller, and route.
3. Add failing frontend service and workspace tests.
4. Implement the typed client method and AI generation UI.
5. Run focused tests, typecheck, build, and a credentialed manual smoke test
   when provider and wallet services are available.

Each step stays local to the HTML-video feature and must not refactor unrelated
creative-image, renderer, campaign, or Video Studio code.

## Acceptance Criteria

- A user can enter a prompt and explicitly request an HTML/CSS video draft.
- The request uses the currently selected duration, aspect ratio, and
  resolution.
- A valid draft fills both existing editors and appears through the existing
  safe preview.
- The user can edit the source before explicitly rendering.
- Generation never starts a render automatically.
- Unsafe or malformed AI output never reaches the client and never incurs a
  wallet deduction.
- Each successful user-initiated generation deducts
  `API_COSTS.AI_HTML_CHAT` exactly once.
- Regeneration does not overwrite user edits without confirmation.
- Generation failures preserve the existing source and preview.
- Existing preview, render queue, polling, output, and security behavior remain
  unchanged.
- Focused tests, typecheck, and production build pass.
