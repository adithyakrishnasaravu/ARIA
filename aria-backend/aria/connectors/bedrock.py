"""Direct Bedrock client — boto3 with IAM credentials or bearer token (AgentCore) fallback."""
from __future__ import annotations

import json
import logging

from aria.config import config

logger = logging.getLogger(__name__)

_client = None


def _bedrock():
    global _client
    if _client is None:
        import boto3

        _client = boto3.client("bedrock-runtime", region_name=config.aws_region)
    return _client


def _invoke_rest(model_id: str, body: str) -> str:
    """Fallback: call Bedrock Runtime via REST with AgentCore bearer token."""
    import httpx

    url = f"https://bedrock-runtime.{config.aws_region}.amazonaws.com/model/{model_id}/invoke"
    try:
        resp = httpx.post(
            url,
            headers={
                "Authorization": f"Bearer {config.bedrock_api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            content=body,
            timeout=30,
        )
        resp.raise_for_status()
        payload = resp.json()
        return payload["content"][0]["text"]
    except Exception as exc:
        logger.error("Bedrock REST invoke failed: %s", exc)
        return ""


def _invoke(model_id: str, messages: list[dict], system: str, max_tokens: int = 1200, temperature: float = 0.1) -> str:
    body = json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system,
            "messages": messages,
        }
    )
    # Try boto3 (standard IAM credentials)
    try:
        resp = _bedrock().invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=body,
        )
        payload = json.loads(resp["body"].read())
        return payload["content"][0]["text"]
    except Exception as exc:
        logger.warning("Bedrock boto3 invoke failed (%s), trying bearer token.", exc)

    # Fallback: bearer token (AgentCore)
    if config.bedrock_api_key:
        return _invoke_rest(model_id, body)

    logger.error("Bedrock unavailable: no valid credentials.")
    return ""


def synthesize_rca(context: dict) -> dict | None:
    """Call Bedrock to synthesize ranked hypotheses and remediation plan."""
    if not config.connector_live("bedrock"):
        return None

    system = (
        "You are ARIA, a production incident root-cause analyst. "
        "Respond ONLY with strict JSON: "
        '{"narrative": string, "confidence": float 0-1, '
        '"hypotheses": [{"title": str, "probability": float, "evidence": [str], "remediation": [str]}], '
        '"recommendedPlan": [str]}. '
        "Rank hypotheses by probability descending."
    )
    prompt = f"Incident context:\n{json.dumps(context, indent=2)}"
    raw = _invoke(config.bedrock_model_id, [{"role": "user", "content": prompt}], system)

    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return None


def copilot_chat(user_prompt: str, history: list[dict], system: str) -> str:
    """Single-turn Bedrock call for copilot chat responses."""
    messages = [*history[-8:], {"role": "user", "content": user_prompt}]
    return _invoke(config.copilot_model_id, messages, system, max_tokens=600, temperature=0.2)
