const liveMode = process.env.ARIA_MODE === "live";

export const ariaConfig = {
  mode: liveMode ? "live" : "mock",
  datadog: {
    apiKey: process.env.DATADOG_API_KEY,
    appKey: process.env.DATADOG_APP_KEY,
    site: process.env.DATADOG_SITE ?? "datadoghq.com",
  },
  bedrock: {
    region: process.env.AWS_REGION ?? process.env.BEDROCK_REGION ?? "us-east-1",
    modelId:
      process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20240620-v1:0",
  },
  neo4j: {
    uri: process.env.NEO4J_URI,
    username: process.env.NEO4J_USERNAME,
    password: process.env.NEO4J_PASSWORD,
    database: process.env.NEO4J_DATABASE ?? "neo4j",
  },
};

export function isConnectorLive(connector: "datadog" | "bedrock" | "neo4j"): boolean {
  if (ariaConfig.mode !== "live") {
    return false;
  }

  if (connector === "datadog") {
    return Boolean(ariaConfig.datadog.apiKey && ariaConfig.datadog.appKey);
  }

  if (connector === "bedrock") {
    return Boolean(ariaConfig.bedrock.region && ariaConfig.bedrock.modelId);
  }

  if (connector === "neo4j") {
    return Boolean(
      ariaConfig.neo4j.uri && ariaConfig.neo4j.username && ariaConfig.neo4j.password,
    );
  }
  return false;
}
