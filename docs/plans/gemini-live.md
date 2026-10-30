# Gemini Live provider

Status: **Approved, in progress.**

Goal: let the side panel agent (and workflows/schedules) use Gemini **Live** models such as
`gemini-3.8-live`, which only work over the Live API (WebSocket `BidiGenerateContent`) and only
answer in **audio**.

## Verified against the real API (feasibility spike, 2026-10-30)

- `gemini-3.8-live` rejects `responseModalities: ['TEXT']` (close 1007). With `['AUDIO']` plus
  `outputAudioTranscription: {}` it works: tool calls arrive as `toolCall`, the spoken answer
  arrives as `serverContent.outputTranscription.text`.
- `gemini-3.8-live-extended-thinking` requires `generationConfig.thinkingConfig.thinkingLevel`
  and also only answers in audio. In two runs it spoke ("I'll read the page") and stopped
  without a tool call: treat it as **experimental**.
- Tool declarations work with `parametersJsonSchema` (our existing Gemini schema helper).
- A screenshot sent as an `inlineData` part in a user turn is understood.
- **History replay quirk:** when earlier turns are replayed with `clientContent`, a
  `functionResponse` part is ignored by the model ("the call returned no content"). Keeping the
  `functionCall` part in the model turn and sending the result as a **user text part**
  (`Result of read_page (call_1):\n…`) works.

## Design

- New provider id `gemini-live`, label "Gemini Live", in the registry next to `gemini`.
  - Key: `gemini-live.apiKey`, falling back to the Gemini provider's key when empty (one key for
    both). Model default `gemini-3.8-live`. Base URL default
    `wss://generativelanguage.googleapis.com` (overridable; used by e2e).
  - `listModels`: REST `GET /v1beta/models`, keep models whose `supportedGenerationMethods`
    include `bidiGenerateContent` and whose id contains `live` but not `translate` or
    `transcribe`. Models with `thinking: true` get the label suffix "(experimental)".
- One Live session **per agent step** (matches the `Provider.stream` contract and keeps provider
  switching mid-chat working):
  1. Open `wss://…/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=…`
     (browsers cannot set headers on WebSocket; never log this URL).
  2. Send `setup`: `model`, `generationConfig: { responseModalities: ['AUDIO'] }` plus
     `thinkingConfig: { thinkingLevel: 'low' }` for models with `thinking: true` (from the model
     metadata, cached; fall back to the id containing `thinking`), `outputAudioTranscription: {}`,
     `systemInstruction`, `tools` (shared Gemini schema helper, `$schema` stripped).
  3. On `setupComplete`, send `clientContent { turns, turnComplete: true }`.
  4. Map server messages to provider events: transcription text → `text_delta`; `toolCall` →
     one `tool_call` event per function call, then `done { stopReason: 'tool_use' }` and close;
     `serverContent.turnComplete` → `done { stopReason: 'end' }`; `usageMetadata` →
     usage (`promptTokenCount`, `responseTokenCount` + `thoughtsTokenCount`). Audio data is
     ignored.
  5. Close codes other than 1000/1005 → `error` with the server's reason, made readable
     (unsupported model or modality, quota, auth). No message for 60 s → error. The abort signal
     closes the socket.
- History → `turns`: user text → `text`; assistant text → model `text`; `tool_call` → model
  `functionCall { id, name, args }`; `tool_result` → user **text** part
  `Result of <name> (<id>):\n<text>` (or `Error from <name> (<id>):\n…`), followed by
  `inlineData` parts for its images; volatile tab-state note → user text. Signatures are not used.
- Settings/UI: the provider shows in Settings and the model chip like the others, with a one-line
  note: "Answers are transcripts of spoken replies; expect about 4 s per step."

## Tests

- Unit: history → turns translation (incl. tool result as text, images, errors), setup message
  (thinking only for thinking models), event mapping from scripted server messages through an
  injected fake WebSocket, close-code errors, abort, listModels filtering.
- e2e: a mock Live server (`ws`) in `e2e/` that speaks the protocol (setupComplete,
  outputTranscription, toolCall, turnComplete, usageMetadata) and records what it received; run
  the chat flow (tab_open → read_page → click → answer) against it and assert tool results were
  replayed as text.
- Real: the maintainer's key with `gemini-3.8-live` (side-panel form task, workflow repair).
