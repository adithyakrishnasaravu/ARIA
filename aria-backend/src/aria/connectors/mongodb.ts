import { Collection, MongoClient, ObjectId, WithId } from "mongodb";

import { ariaConfig } from "../config";
import { InvestigationReport, Runbook } from "../types";

// ── Atlas connection singleton ────────────────────────────────────────────────
// Connects whenever MONGODB_URI is set — no ARIA_MODE gate.

let cachedClient: MongoClient | null = null;

async function getDb() {
  if (!ariaConfig.mongodb.uri) return null;
  try {
    if (!cachedClient) {
      cachedClient = new MongoClient(ariaConfig.mongodb.uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
      await cachedClient.connect();
    }
    return cachedClient.db(ariaConfig.mongodb.database);
  } catch (error) {
    console.warn("MongoDB: connection failed —", error instanceof Error ? error.message : error);
    cachedClient = null;
    return null;
  }
}

async function getCollection(): Promise<Collection | null> {
  const db = await getDb();
  return db ? db.collection("runbooks") : null;
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
          console.info(`MongoRunbookConnector: fetched ${docs.length} runbooks for "${service}" from Atlas.`);
          return (docs as unknown as WithId<RunbookDoc>[]).map(toRunbook);
        }

        console.info(`MongoRunbookConnector: no runbooks in Atlas for "${service}" — returning empty.`);
        return [];
      } catch (error) {
        console.warn("MongoRunbookConnector: Atlas query failed —", error instanceof Error ? error.message : error);
      }
    }

    return [];
  }
}

// ── IncidentStore ─────────────────────────────────────────────────────────────

export interface StoredIncident {
  id: string;
  ticketNumber: number;
  incidentId: string;
  service: string;
  summary: string;
  severity: string;
  rcaOneLiner: string;
  actionOneLiner: string;
  confidence: number;
  blastRadius: number;
  createdAt: string;
}

interface IncidentDoc {
  ticketNumber: number;
  report: InvestigationReport; // full report — nothing stripped
  createdAt: string;
}

function docToStoredIncident(doc: WithId<IncidentDoc>): StoredIncident {
  const { report } = doc;
  const topHypothesis = report.rca.hypotheses[0];
  return {
    id: doc._id.toString(),
    ticketNumber: doc.ticketNumber,
    incidentId: report.alert.incidentId,
    service: report.alert.service,
    summary: report.alert.summary,
    severity: report.triage.severity,
    rcaOneLiner: topHypothesis?.title ?? report.rca.narrative.slice(0, 120),
    actionOneLiner: report.rca.recommendedPlan[0] ?? "Review and action required.",
    confidence: report.rca.confidence,
    blastRadius: report.rca.blastRadius.length,
    createdAt: doc.createdAt,
  };
}

export class IncidentStore {
  async save(report: InvestigationReport): Promise<void> {
    const db = await getDb();
    if (!db) {
      console.warn("IncidentStore: MONGODB_URI not set — incident not persisted.");
      return;
    }

    try {
      const col = db.collection<IncidentDoc>("incidents");
      const ticketNumber = (await col.countDocuments()) + 1;
      await col.insertOne({
        ticketNumber,
        report,
        createdAt: new Date().toISOString(),
      });
      console.info(`IncidentStore: saved INC-${String(ticketNumber).padStart(3, "0")} (${report.alert.service})`);
    } catch (error) {
      console.warn("IncidentStore: save failed —", error instanceof Error ? error.message : error);
    }
  }

  async list(): Promise<StoredIncident[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      const docs = await db
        .collection<IncidentDoc>("incidents")
        .find()
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();

      return docs.map(docToStoredIncident);
    } catch (error) {
      console.warn("IncidentStore: list failed —", error instanceof Error ? error.message : error);
      return [];
    }
  }

  async getReport(id: string): Promise<InvestigationReport | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const doc = await db
        .collection<IncidentDoc>("incidents")
        .findOne({ _id: new ObjectId(id) });
      return doc?.report ?? null;
    } catch {
      return null;
    }
  }
}
