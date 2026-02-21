"""ARIA FastAPI backend — Strands Agents + Bedrock + Datadog LLM Observability."""
from __future__ import annotations

import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# ── Datadog LLM Observability ── instrument botocore before boto3 loads ────────
if os.getenv("DD_API_KEY") and os.getenv("ARIA_MODE") == "live":
    try:
        import ddtrace

        ddtrace.patch(botocore=True)
        from ddtrace.llmobs import LLMObs

        LLMObs.enable(
            ml_app=os.getenv("DD_ML_APP", "aria-incident-agent"),
            integrations_enabled=True,
        )
        print("✓ Datadog LLM Observability enabled")
    except Exception as _dd_err:
        print(f"⚠ ddtrace init skipped: {_dd_err}")

from aria.config import config  # noqa: E402 — after ddtrace patch
from aria.connectors.bedrock import copilot_chat  # noqa: E402
from aria.orchestrator import AriaOrchestrator  # noqa: E402
from aria.types import AlertPayload  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aria")

orchestrator = AriaOrchestrator()

_COPILOT_SYSTEM = (
    "You are ARIA Copilot, an incident-response assistant. "
    "Be concise, practical, and runbook-oriented. "
    "When asked for rollback strategy, give clear ordered steps, risk checks, and communication guidance."
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    logger.info("ARIA backend starting on port %d (mode=%s)", config.port, config.mode)
    yield


app = FastAPI(title="ARIA Incident Backend", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "aria-backend", "runtime": "fastapi+strands", "mode": config.mode}


@app.get("/")
async def root() -> dict:
    return {
        "service": "aria-backend",
        "runtime": "fastapi+strands-agents",
        "endpoints": ["/health", "/incidents/investigate", "/copilotkit"],
    }


# ── Main investigation endpoint (SSE stream) ──────────────────────────────────

@app.post("/incidents/investigate")
async def investigate(request: Request) -> StreamingResponse:
    body = await request.json()
    alert = AlertPayload(**body)

    async def generate() -> AsyncIterator[str]:
        try:
            async for event in orchestrator.run(alert):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            logger.exception("Investigation pipeline error")
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive"},
    )


# ── CopilotKit — ag-ui protocol (manual implementation) ───────────────────────

def _extract_last_user_message(messages: list[dict]) -> str:
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content", "")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            return " ".join(
                b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"
            ).strip()
    return ""


def _convert_history(messages: list[dict]) -> list[dict]:
    result = []
    for msg in messages[-10:]:
        role = msg.get("role")
        if role not in ("user", "assistant"):
            continue
        content = msg.get("content", "")
        text = content if isinstance(content, str) else " ".join(
            b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"
        )
        if text.strip():
            result.append({"role": role, "content": text.strip()})
    return result


@app.get("/copilotkit/info")
async def copilotkit_info() -> dict:
    return {
        "agents": [{"name": "default", "id": "default", "description": "ARIA Incident Copilot"}],
        "actions": [{"name": "investigate_incident", "description": "Run ARIA triage→investigation→RCA pipeline"}],
    }


@app.post("/copilotkit")
@app.post("/copilotkit/agent/{agent_id}/run")
@app.post("/copilotkit/agent/{agent_id}/connect")
async def copilotkit_handler(request: Request, agent_id: str = "default") -> StreamingResponse:
    body = await request.json()
    thread_id = body.get("threadId") or str(uuid.uuid4())
    run_id = body.get("runId") or str(uuid.uuid4())
    messages: list[dict] = body.get("messages") or []

    async def generate() -> AsyncIterator[str]:
        msg_id = str(uuid.uuid4())

        yield f"data: {json.dumps({'type': 'RUN_STARTED', 'threadId': thread_id, 'runId': run_id})}\n\n"

        user_prompt = _extract_last_user_message(messages)
        history = _convert_history(messages[:-1])

        if user_prompt:
            import asyncio

            response_text = await asyncio.to_thread(copilot_chat, user_prompt, history, _COPILOT_SYSTEM)
        else:
            response_text = "Share the incident details and I'll help with root cause analysis and remediation."

        if not response_text:
            response_text = "Claude on Bedrock returned an empty response — check your AWS credentials and model access."

        yield f"data: {json.dumps({'type': 'TEXT_MESSAGE_START', 'messageId': msg_id, 'role': 'assistant'})}\n\n"
        yield f"data: {json.dumps({'type': 'TEXT_MESSAGE_CONTENT', 'messageId': msg_id, 'delta': response_text})}\n\n"
        yield f"data: {json.dumps({'type': 'TEXT_MESSAGE_END', 'messageId': msg_id})}\n\n"
        yield f"data: {json.dumps({'type': 'RUN_FINISHED', 'threadId': thread_id, 'runId': run_id})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive"},
    )


@app.post("/copilotkit/agent/{agent_id}/stop/{thread_id}")
async def copilotkit_stop(agent_id: str, thread_id: str) -> dict:
    return {"stopped": True, "threadId": thread_id}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=config.port, reload=True)
