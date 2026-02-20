import neo4j, { Driver } from "neo4j-driver";

import { ariaConfig, isConnectorLive } from "../config";
import { mockDependencyGraph } from "../mock-data";
import { DependencyGraphResult } from "../types";

let cachedDriver: Driver | null = null;

function getDriver(): Driver {
  if (cachedDriver) {
    return cachedDriver;
  }

  cachedDriver = neo4j.driver(
    ariaConfig.neo4j.uri ?? "",
    neo4j.auth.basic(ariaConfig.neo4j.username ?? "", ariaConfig.neo4j.password ?? ""),
  );

  return cachedDriver;
}

function toStringArray(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value : null))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export class Neo4jConnector {
  async fetchBlastRadius(service: string): Promise<DependencyGraphResult> {
    if (!isConnectorLive("neo4j")) {
      return mockDependencyGraph(service);
    }

    const driver = getDriver();
    const session = driver.session({ database: ariaConfig.neo4j.database });

    try {
      const downstreamResult = await session.run(
        `
        MATCH (down:Service)-[:DEPENDS_ON*1..2]->(s:Service {name: $service})
        RETURN DISTINCT down.name AS serviceName
        LIMIT 25
        `,
        { service },
      );

      const upstreamResult = await session.run(
        `
        MATCH (s:Service {name: $service})-[:DEPENDS_ON*1..2]->(up:Service)
        RETURN DISTINCT up.name AS serviceName
        LIMIT 25
        `,
        { service },
      );

      const impacted = toStringArray(
        downstreamResult.records.map((record) => record.get("serviceName")),
      );
      const upstream = toStringArray(
        upstreamResult.records.map((record) => record.get("serviceName")),
      );

      return {
        impactedServices: impacted,
        upstreamServices: upstream,
        connectorMode: "live",
      };
    } catch {
      return mockDependencyGraph(service);
    } finally {
      await session.close();
    }
  }
}
