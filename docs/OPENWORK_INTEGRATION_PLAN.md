# OpenWork Integration Plan for BonzAI

## Executive Summary

This document outlines a plan to integrate [OpenWork](https://github.com/accomplish-ai/openwork) with BonzAI's local models, allowing OpenWork users to leverage BonzAI's GPU-accelerated LLM inference for file management, document creation, and browser automation tasks.

## What is OpenWork?

OpenWork is an open-source AI desktop agent for macOS that automates:
- **File Management**: Sort, rename, and move files based on content or rules
- **Document Operations**: Write, summarize, or rewrite documents
- **Tool Integration**: Works with Notion, Google Drive, Dropbox via local APIs
- **Repeatable Workflows**: Save automation sequences as reusable skills

### Technical Stack
- **Frontend**: React + Vite
- **Desktop Framework**: Electron
- **Task Execution**: OpenCode CLI via node-pty
- **LLM Integration**: @ai-sdk/openai-compatible package

## Integration Approach

OpenWork uses OpenCode CLI which supports **OpenAI-compatible APIs**. BonzAI can expose its local LLM models via an OpenAI-compatible REST API endpoint, allowing OpenWork to use BonzAI as a local LLM provider.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    OpenWork     │────▶│  BonzAI API     │────▶│  node-llama-cpp │
│  (OpenCode CLI) │     │  (OpenAI compat)│     │  (Local GGUF)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
     HTTP POST              /v1/chat/              GPU Inference
```

## Implementation Phases

### Phase 1: OpenAI-Compatible API Endpoint

**Goal**: Expose BonzAI's local LLM via OpenAI-compatible REST API

**New Endpoints in `src/main.js` or dedicated API server**:

```javascript
// POST /v1/chat/completions
{
  "model": "qwen2.5-coder-14b-instruct-q4_k_m",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "stream": true,  // SSE streaming support
  "temperature": 0.7,
  "max_tokens": 4096
}

// Response (non-streaming)
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "qwen2.5-coder-14b-instruct-q4_k_m",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "Hello! How can I help?"},
    "finish_reason": "stop"
  }],
  "usage": {"prompt_tokens": 10, "completion_tokens": 8, "total_tokens": 18}
}

// GET /v1/models - List available models
{
  "object": "list",
  "data": [
    {"id": "qwen2.5-coder-14b-instruct-q4_k_m", "object": "model", "owned_by": "bonzai"},
    {"id": "deepseek-r1-distill-qwen-7b-q4_k_m", "object": "model", "owned_by": "bonzai"}
  ]
}
```

**Implementation Options**:

| Option | Pros | Cons |
|--------|------|------|
| **A. Electron IPC + Express** | Reuse existing node-llama-cpp setup | Port conflicts, process management |
| **B. Dedicated HTTP server in main.js** | Simple, integrated | Blocks main thread if not careful |
| **C. Separate Node process** | Clean separation, scalable | More complex, IPC overhead |

**Recommended**: Option A - Add Express server in Electron main process on a configurable port (e.g., 11435).

### Phase 2: Streaming Support (SSE)

OpenCode CLI expects Server-Sent Events for real-time token streaming:

```javascript
// SSE Response format
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"!"}}]}

data: [DONE]
```

**node-llama-cpp streaming integration**:
```javascript
const session = new LlamaChatSession({...});

for await (const token of session.promptStream(userMessage)) {
  res.write(`data: ${JSON.stringify({
    id: `chatcmpl-${uuid()}`,
    choices: [{ delta: { content: token } }]
  })}\n\n`);
}
res.write('data: [DONE]\n\n');
res.end();
```

### Phase 3: Model Management API

Expose model availability and download status:

```javascript
// GET /v1/models/status
{
  "models": [
    {
      "id": "qwen2.5-coder-14b-instruct-q4_k_m",
      "status": "ready",     // ready | downloading | not_installed
      "size_bytes": 9580000000,
      "parameters": "14B"
    }
  ]
}

// POST /v1/models/download
{"model": "deepseek-r1-distill-qwen-7b-q4_k_m"}
```

### Phase 4: OpenWork Configuration

Users configure OpenWork to use BonzAI via `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "bonzai": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "BonzAI (local)",
      "options": {
        "baseURL": "http://localhost:11435/v1"
      },
      "models": {
        "qwen2.5-coder-14b-instruct-q4_k_m": {
          "name": "Qwen 2.5 Coder 14B"
        },
        "deepseek-r1-distill-qwen-7b-q4_k_m": {
          "name": "DeepSeek R1 7B"
        }
      }
    }
  },
  "model": "qwen2.5-coder-14b-instruct-q4_k_m"
}
```

## File Changes Required

### New Files

| File | Purpose |
|------|---------|
| `src/server/openai-api.js` | OpenAI-compatible REST API server |
| `src/services/openai.service.js` | Frontend service for API configuration |
| `docs/OPENWORK_SETUP.md` | User guide for OpenWork integration |

### Modified Files

| File | Changes |
|------|---------|
| `src/main.js` | Start OpenAI API server, expose port via IPC |
| `src/preload.js` | Add `electronAPI.getOpenAIEndpoint()` |
| `src/stores/settingsStore.js` | Store API port configuration |
| `package.json` | Add express dependency |

## API Server Implementation Sketch

```javascript
// src/server/openai-api.js
import express from 'express';
import { getLlama, LlamaChatSession } from 'node-llama-cpp';

const app = express();
app.use(express.json());

// CORS for local access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// List models
app.get('/v1/models', async (req, res) => {
  const models = await getAvailableModels();
  res.json({
    object: 'list',
    data: models.map(m => ({
      id: m.filename.replace('.gguf', ''),
      object: 'model',
      owned_by: 'bonzai'
    }))
  });
});

// Chat completions
app.post('/v1/chat/completions', async (req, res) => {
  const { model, messages, stream, temperature, max_tokens } = req.body;

  // Load model if needed
  await ensureModelLoaded(model);

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    for await (const token of session.promptStream(formatMessages(messages))) {
      res.write(`data: ${JSON.stringify({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: token } }]
      })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } else {
    const response = await session.prompt(formatMessages(messages));
    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: response },
        finish_reason: 'stop'
      }]
    });
  }
});

export function startOpenAIServer(port = 11435) {
  return app.listen(port, '127.0.0.1', () => {
    console.log(`[BonzAI] OpenAI-compatible API running on http://localhost:${port}`);
  });
}
```

## Security Considerations

1. **Localhost Only**: Bind to `127.0.0.1` to prevent external access
2. **Optional Auth**: Support bearer token authentication for multi-user setups
3. **Rate Limiting**: Prevent resource exhaustion from rapid requests
4. **Model Validation**: Only serve models that exist locally

## Testing Strategy

1. **Unit Tests**: API response format compliance
2. **Integration Tests**: OpenCode CLI connection verification
3. **E2E Tests**: Full OpenWork → BonzAI → LLM flow
4. **Compatibility Tests**: Verify with multiple OpenAI SDK versions

## User Experience Flow

1. User launches BonzAI
2. BonzAI starts OpenAI-compatible API on port 11435
3. User installs OpenWork
4. User adds BonzAI provider config to `~/.config/opencode/opencode.json`
5. OpenWork uses BonzAI's local models for all AI tasks

## Future Enhancements

- **Auto-discovery**: mDNS/Bonjour for automatic BonzAI detection
- **Model Sync**: OpenWork shows available BonzAI models dynamically
- **GPU Status**: Expose VRAM usage for model selection guidance
- **Function Calling**: Support tool use for advanced OpenWork agents

## Timeline Estimate

| Phase | Effort |
|-------|--------|
| Phase 1: Basic API | 2-3 days |
| Phase 2: Streaming | 1-2 days |
| Phase 3: Model Management | 1 day |
| Phase 4: Documentation | 1 day |
| Testing & Polish | 2-3 days |

## References

- [OpenWork GitHub](https://github.com/accomplish-ai/openwork)
- [OpenCode Documentation](https://opencode.ai/docs/)
- [OpenCode Provider Config](https://opencode.ai/docs/providers/)
- [Setting Up OpenCode with Local Models](https://theaiops.substack.com/p/setting-up-opencode-with-local-models)
- [Configure Local LLM with OpenCode](https://dev.to/tobrun_vannuland_70632c7/configure-local-llm-with-opencode-1gdb)
