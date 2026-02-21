"""Neo4j connector — sync driver for use inside Strands tools."""
from __future__ import annotations

import logging

from aria.config import config
from aria.mock_data import mock_dependency_graph
from aria.types import DependencyGraphResult

logger = logging.getLogger(__name__)

_driver = None


def _get_driver():
    global _driver
    if _driver is None:
        from neo4j import GraphDatabase

        _driver = GraphDatabase.driver(
            config.neo4j_uri or "",
            auth=(config.neo4j_username or "neo4j", config.neo4j_password or ""),
        )
    return _driver


def fetch_blast_radius(service: str) -> DependencyGraphResult:
    if not config.connector_live("neo4j"):
        return mock_dependency_graph(service)

    driver = _get_driver()
    try:
        with driver.session(database=config.neo4j_database) as session:
            downstream = session.run(
                """
                MATCH (down:Service)-[:DEPENDS_ON*1..2]->(s:Service {name: $service})
                RETURN DISTINCT down.name AS serviceName
                LIMIT 25
                """,
                service=service,
            )
            upstream = session.run(
                """
                MATCH (s:Service {name: $service})-[:DEPENDS_ON*1..2]->(up:Service)
                RETURN DISTINCT up.name AS serviceName
                LIMIT 25
                """,
                service=service,
            )
            impacted = list({r["serviceName"] for r in downstream if r["serviceName"]})
            up_list = list({r["serviceName"] for r in upstream if r["serviceName"]})

        return DependencyGraphResult(
            impactedServices=impacted,
            upstreamServices=up_list,
            connectorMode="live",
        )
    except Exception as exc:
        logger.warning("Neo4j query failed (%s), using mock.", exc)
        return mock_dependency_graph(service)
