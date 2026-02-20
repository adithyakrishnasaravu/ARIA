import { MiniMaxEvidence } from "../types";

export class MiniMaxConnector {
  async analyzeScreenshot(screenshotBase64?: string): Promise<MiniMaxEvidence | undefined> {
    if (!screenshotBase64) {
      return undefined;
    }

    return {
      summary:
        "MiniMax is currently stubbed for speed. Screenshot accepted and linked to incident context.",
      anomalies: [
        `Stub analysis generated from uploaded image payload (${Math.min(screenshotBase64.length, 120)} chars preview).`,
        "Likely hotspot around DB wait lane and request queue contention.",
      ],
      connectorMode: "mock",
    };
  }
}
