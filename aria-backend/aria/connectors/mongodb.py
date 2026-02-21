"""MongoDB Atlas connector — sync pymongo for use inside Strands tools."""
from __future__ import annotations

import logging

from aria.config import config
from aria.mock_data import mock_runbooks
from aria.types import Runbook

logger = logging.getLogger(__name__)

_client = None


def _collection():
    global _client
    if _client is None:
        from pymongo import MongoClient

        _client = MongoClient(config.mongodb_uri or "")
    return _client["aria"]["runbooks"]


def fetch_runbooks(service: str, summary: str = "", limit: int = 3) -> list[Runbook]:
    if not config.connector_live("mongodb"):
        return mock_runbooks(service)

    try:
        col = _collection()
        cursor = col.find(
            {"$or": [{"service": service}, {"tags": service}]},
            limit=limit,
            sort=[("similarityScore", -1)],
        )
        docs = list(cursor)
        if not docs:
            return mock_runbooks(service)
        return [
            Runbook(
                title=d.get("title", ""),
                summary=d.get("summary", ""),
                steps=d.get("steps", []),
                lastUsedAt=d.get("lastUsedAt"),
                similarityScore=float(d.get("similarityScore", 0.0)),
            )
            for d in docs
        ]
    except Exception as exc:
        logger.warning("MongoDB query failed (%s), using mock.", exc)
        return mock_runbooks(service)
