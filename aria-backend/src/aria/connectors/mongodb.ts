import { Collection, MongoClient, WithId } from "mongodb";

import { ariaConfig, isConnectorLive } from "../config";
import { Runbook } from "../types";

// ── Atlas connection singleton ────────────────────────────────────────────────

let cachedClient: MongoClient | null = null;

async function getCollection(): Promise<Collection | null> {
  if (!isConnectorLive("mongodb")) return null;

  try {
    if (!cachedClient) {
      cachedClient = new MongoClient(ariaConfig.mongodb.uri!, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
      await cachedClient.connect();
    }
    return cachedClient.db(ariaConfig.mongodb.database).collection("runbooks");
  } catch (error) {
    console.warn(
      "MongoRunbookConnector: Atlas connection failed —",
      error instanceof Error ? error.message : error,
    );
    cachedClient = null;
    return null;
  }
}

// ── Document → Runbook mapping ────────────────────────────────────────────────

interface RunbookDoc {
  service: string;
  title: string;
  summary: string;
  steps: string[];
  lastUsedAt: string;
  tags?: string[];
  similarityScore?: number;
}

function toRunbook(doc: WithId<RunbookDoc>): Runbook {
  return {
    title: doc.title,
    summary: doc.summary,
    steps: doc.steps,
    lastUsedAt: doc.lastUsedAt,
    similarityScore: doc.similarityScore ?? 0.7,
  };
}

// ── Connector ─────────────────────────────────────────────────────────────────

export class MongoRunbookConnector {
  /**
   * Fetch runbooks for a service from MongoDB Atlas.
   * Falls back to an empty array if Atlas is unreachable — the RCA agent
   * handles a missing runbook list gracefully.
   */
  async fetchRunbooks(service: string, _summary: string, limit = 3): Promise<Runbook[]> {
    const collection = await getCollection();

    if (collection) {
      try {
        const docs = await collection
          .find({ service })
          .sort({ similarityScore: -1, lastUsedAt: -1 })
          .limit(limit)
          .toArray();

        if (docs.length > 0) {
          console.info(
            `MongoRunbookConnector: fetched ${docs.length} runbooks for "${service}" from Atlas.`,
          );
          return (docs as unknown as WithId<RunbookDoc>[]).map(toRunbook);
        }

        console.info(
          `MongoRunbookConnector: no runbooks in Atlas for "${service}" — returning empty.`,
        );
        return [];
      } catch (error) {
        console.warn(
          "MongoRunbookConnector: Atlas query failed —",
          error instanceof Error ? error.message : error,
        );
      }
    }

    // Atlas unavailable — return empty so RCA agent uses its own reasoning
    return [];
  }
}
