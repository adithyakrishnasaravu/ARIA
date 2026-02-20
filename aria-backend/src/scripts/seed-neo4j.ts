import "dotenv/config";

import neo4j from "neo4j-driver";

const uri = process.env.NEO4J_URI;
const username = process.env.NEO4J_USERNAME;
const password = process.env.NEO4J_PASSWORD;
const database = process.env.NEO4J_DATABASE ?? "neo4j";

if (!uri || !username || !password) {
  console.error("Missing NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD in environment.");
  process.exit(1);
}

const driver = neo4j.driver(uri, neo4j.auth.basic(username, password));

const services = [
  "web-frontend",
  "api-gateway",
  "checkout-svc",
  "payment-svc",
  "orders-db",
  "inventory-svc",
  "auth-svc",
  "order-svc",
  "invoice-svc",
  "notification-svc",
];

const edges: Array<[string, string]> = [
  ["web-frontend", "api-gateway"],
  ["checkout-svc", "api-gateway"],
  ["api-gateway", "payment-svc"],
  ["checkout-svc", "payment-svc"],
  ["order-svc", "payment-svc"],
  ["invoice-svc", "payment-svc"],
  ["payment-svc", "orders-db"],
  ["orders-db", "inventory-svc"],
  ["inventory-svc", "auth-svc"],
  ["notification-svc", "order-svc"],
];

async function main(): Promise<void> {
  const session = driver.session({ database });

  try {
    for (const service of services) {
      await session.run(
        `
        MERGE (s:Service {name: $name})
        RETURN s
        `,
        { name: service },
      );
    }

    for (const [from, to] of edges) {
      await session.run(
        `
        MATCH (a:Service {name: $from}), (b:Service {name: $to})
        MERGE (a)-[:DEPENDS_ON]->(b)
        `,
        { from, to },
      );
    }

    console.log(`Seeded Neo4j graph with ${services.length} services and ${edges.length} edges.`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((error) => {
  console.error("Neo4j seed failed:", error);
  process.exit(1);
});
