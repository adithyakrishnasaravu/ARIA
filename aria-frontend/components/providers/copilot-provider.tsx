"use client";

import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-ui/styles.css";

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const runtimeUrl =
    process.env.NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL ??
    "http://localhost:4000/copilotkit";

  return (
    <CopilotKit runtimeUrl={runtimeUrl} showDevConsole>
      {children}
    </CopilotKit>
  );
}
