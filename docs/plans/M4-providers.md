# M4 — More providers

Goal: the side panel agent works with OpenAI, Gemini and any OpenAI-compatible server (Ollama,
LM Studio, OpenRouter, custom), and each chat can switch provider/model.

## Approach

- **No new SDKs.** Each adapter is `fetch` + a small SSE reader, written against the providers'
  REST APIs. Smaller bundle, no SDK surprises. Share one SSE line parser
  (`src/providers/sse.ts`); the Anthropic adapter keeps its SDK.
- Adapters implement the existing `Provider` interface and only translate; the agent loop,
  tools, pruning and UI stay provider-neutral.
- `Provider.id` becomes `ProviderId = 'anthropic' | 'openai' | 'gemini' | 'compatible'`.
  A registry `src/providers/index.ts` maps id → `{ provider, label, needsKey, defaultBaseUrl }`.

## OpenAI + OpenAI-compatible (`src/providers/openai/`)

One adapter on the **Chat Completions** API (`POST {baseUrl}/chat/completions`, `stream: true`,
`stream_options: { include_usage: true }`), used by two registry entries:

- `openai`: base URL `https://api.openai.com/v1`, key required.
- `compatible`: base URL from a preset or typed in; key optional (sent as `Bearer` only if set).
  Presets: Ollama `http://localhost:11434/v1`, LM Studio `http://localhost:1234/v1`,
  OpenRouter `https://openrouter.ai/api/v1`.

Translation:

- System prompt → first `system` message. Tools → `{ type: 'function', function: { name,
description, parameters } }`.
- Assistant `tool_call` parts → `tool_calls` (arguments as JSON string); `tool_result` →
  `role: 'tool'` messages with the text content. **Images in tool results**: tool messages are
  text-only, so after the tool messages add one `user` message with `image_url` parts
  (`data:<mime>;base64,…`) labelled `Screenshot from <tool call id>`.
- Stream: accumulate `delta.content` as `text_delta`; accumulate `delta.tool_calls[i]`
  (id/name in first chunk, `arguments` fragments after) and emit complete `tool_call`s at the end;
  bad JSON arguments → `{}` plus the raw string in the error path the executor reports.
  `finish_reason` `tool_calls` → `tool_use`, `length` → `max_tokens`, `stop` → `end`.
- Usage from the final chunk: `prompt_tokens`, `completion_tokens`,
  `prompt_tokens_details.cached_tokens` → `cacheReadTokens`. Missing usage is fine.
- Use `max_completion_tokens: 8192` for `openai`; for `compatible` send `max_tokens` (wider
  support).
- `listModels`: `GET {baseUrl}/models`; for `openai` keep ids starting with `gpt-`, `o`, or
  `chatgpt`; sort; on failure return `[]` (the model field accepts free text, see UI).

## Gemini (`src/providers/gemini/`)

Native API: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse`,
key in `x-goog-api-key` header. Base URL overridable (for tests).

- System → `systemInstruction`. Tools → one `{ functionDeclarations: [...] }` using
  `parametersJsonSchema` (accepts our JSON Schema as is).
- Roles `user`/`model`. Assistant text → `text` parts, `tool_call` → `functionCall { id?, name,
args }`; `tool_result` → `functionResponse { id?, name, response: { output | error } }` (look
  up the name from the matching call in history), followed by `inlineData` parts for any images,
  in the same `user` turn.
- **Thought signatures**: Gemini returns `thoughtSignature` on parts (notably `functionCall`) and
  rejects follow-up requests that drop them. Add an optional `signature?: string` to the
  `text` and `tool_call` `Part` types (provider-opaque, persisted in history) and send it back
  unchanged. For tool calls that came from another provider (chat switched mid-way), check
  Google's docs for the documented placeholder signature and use it.
- Calls without an `id` get a generated one.
- `finishReason` `STOP` with function calls → `tool_use`; `MAX_TOKENS` → `max_tokens`; safety or
  other blocks → `other` with a readable error. Usage from `usageMetadata`
  (`promptTokenCount`, `candidatesTokenCount`, `cachedContentTokenCount`).
- `generationConfig.maxOutputTokens: 8192`.
- `listModels`: `GET /v1beta/models`, keep those whose `supportedGenerationMethods` include
  `generateContent`, strip the `models/` prefix, label = `displayName`.

## Errors

Every adapter maps HTTP errors to short messages like the Anthropic one: 401/403 bad key, 404
unknown model, 429 rate limit, 5xx provider unavailable, network failure → "Could not reach
<label> at <baseUrl>" (useful for a local Ollama that is not running). Include the provider's own
error message when it has one.

## Settings

- Per provider in `chrome.storage.local`: `<id>.apiKey`, `<id>.baseUrl`, `<id>.model` (Anthropic
  keeps its existing `anthropic.*` keys, so nothing to migrate). Plus `defaultProvider`.
- Settings view: provider tabs or a select; for the selected provider: key (hidden for
  `compatible` unless typed), base URL (preset select + text for `compatible`, under Advanced for
  the others), model field = text input with a `datalist` of `listModels` results (free text
  always allowed), Save, and "Use as default".
- A provider is **ready** when it has a key (or is `compatible` with a base URL) and a model.

## Per-chat provider/model

- Chat records store `providerId` and `model`. New chats take the default provider and its
  saved model. Old chats without these fields read as Anthropic + saved Anthropic model.
- The chat view has a compact picker above the composer: provider select (ready providers only)
  - model input with datalist. Changing it applies to the next message of that chat and is saved
    on the chat. Disabled while a task runs.
- The session reads the chat's provider/model for each run; settings for keys/base URLs still come
  from storage.
- Empty state when no provider is ready (replaces the Anthropic-only one).

## Tests

- Unit (Vitest), per adapter: translation of a full history (text, tool call, tool result with
  image, signature round-trip for Gemini), stream parsing from SSE fixtures (text, parallel tool
  calls split across chunks, usage, finish reasons), error mapping, listModels filtering.
  Shared SSE parser tests (multi-line data, comments, `[DONE]`).
- e2e: generalize the mock server into `e2e/mockProviders.ts` with OpenAI-style and Gemini-style
  scripted SSE. Run the existing chat flow (tab_open → read_page → click → answer) against the
  `compatible` provider and against Gemini, and one test that switches a chat from Anthropic to
  the compatible provider mid-conversation and checks the second request carries the earlier tool
  history in OpenAI format.
- Real APIs are not available here; note that in the session log.
