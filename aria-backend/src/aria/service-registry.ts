import registryData from "./service-registry.json";

export type ServiceTier = "T1" | "T2" | "T3";

export interface ServiceProfile {
  tier: ServiceTier;
  sla: string;
  revenueImpactPerMinute: string;
  description: string;
  downstreamCount: number;
}

const REGISTRY = registryData as Record<string, ServiceProfile>;

const UNKNOWN_SERVICE: ServiceProfile = {
  tier: "T2",
  sla: "99.9%",
  revenueImpactPerMinute: "unknown",
  description: "Unregistered service — treat conservatively until catalogued",
  downstreamCount: 0,
};

export function lookupService(service: string): ServiceProfile {
  return REGISTRY[service] ?? UNKNOWN_SERVICE;
}

/** Returns all registered service names — useful for dynamic service discovery. */
export function listServices(): string[] {
  return Object.keys(REGISTRY);
}
