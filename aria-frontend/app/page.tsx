import Link from "next/link";

const PIPELINE = [
  {
    n: "01",
    name: "Fast Triage",
    badge: "~5s",
    desc: "Alert metrics, service profile, and operational context. No log queries yet.",
    card: "bg-amber-50 border-amber-200",
    text: "text-amber-900",
    badge_cls: "bg-amber-100 text-amber-700",
  },
  {
    n: "02",
    name: "Investigation",
    badge: "live",
    desc: "Datadog error logs, APM spans, metric trend, cross-service trace correlation.",
    card: "bg-sky-50 border-sky-200",
    text: "text-sky-900",
    badge_cls: "bg-sky-100 text-sky-700",
  },
  {
    n: "03",
    name: "Re-triage",
    badge: "~2s",
    desc: "Severity refined against Datadog evidence. Confidence updated with hard signal.",
    card: "bg-amber-50 border-amber-200",
    text: "text-amber-900",
    badge_cls: "bg-amber-100 text-amber-700",
  },
  {
    n: "04",
    name: "Root Cause",
    badge: "ranked",
    desc: "Neo4j blast radius traversal, runbook matching, ranked hypothesis synthesis.",
    card: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-900",
    badge_cls: "bg-emerald-100 text-emerald-700",
  },
  {
    n: "05",
    name: "Remediation",
    badge: "plan",
    desc: "Prioritized action plan from runbook history and blast radius scope.",
    card: "bg-cyan-50 border-cyan-200",
    text: "text-cyan-900",
    badge_cls: "bg-cyan-100 text-cyan-700",
  },
];

const INTEGRATIONS = [
  { name: "Datadog", sub: "Error logs · APM spans · Metric trend" },
  { name: "Neo4j", sub: "Service dependency graph · Blast radius" },
  { name: "MongoDB", sub: "Runbook vector store · History match" },
  { name: "AWS Bedrock", sub: "Claude Sonnet 4.6 · Dual-pass reasoning" },
];

export default function Home() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-0)", color: "var(--ink)" }}>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 border-b border-stone-200/70"
        style={{ background: "rgba(250,247,242,0.92)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-base tracking-tight text-stone-900">ARIA</span>
          <span className="hidden sm:inline text-[10px] uppercase tracking-[0.18em] text-stone-400">
            Control Center
          </span>
        </div>
        <Link
          href="/console"
          className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
        >
          Launch Console <span aria-hidden>→</span>
        </Link>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="pt-40 pb-28 px-6 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full border border-stone-300/60 bg-stone-100/80 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-500 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
          Claude Sonnet 4.6 · AWS Bedrock
        </div>
        <h1 className="text-6xl md:text-[76px] font-semibold tracking-tight text-stone-900 leading-[1.07]">
          Your on-call engineer<br />
          <span className="text-stone-400">that never sleeps.</span>
        </h1>
        <p className="mt-7 text-lg text-stone-500 max-w-xl mx-auto leading-relaxed">
          ARIA autonomously triages, investigates, and remediates production incidents — from first alert to a prioritized remediation plan, in seconds.
        </p>
        <div className="mt-10 flex items-center justify-center gap-5">
          <Link
            href="/console"
            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
          >
            Run a live incident <span aria-hidden>→</span>
          </Link>
          <a
            href="#how-it-works"
            className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
          >
            How it works
          </a>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <section className="border-y border-stone-200/60 py-16 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-0 divide-y md:divide-y-0 md:divide-x divide-stone-200/60 text-center md:text-left">
          <div className="md:pr-12 pb-8 md:pb-0">
            <p className="text-5xl font-semibold text-stone-900 tracking-tight">
              $9,000<span className="text-stone-400 text-2xl font-normal">/min</span>
            </p>
            <p className="mt-2 text-sm text-stone-500 max-w-xs mx-auto md:mx-0">
              Average cost of a production incident. The first 15 minutes are spent just understanding what&apos;s on fire.
            </p>
          </div>
          <div className="md:px-12 py-8 md:py-0">
            <p className="text-5xl font-semibold text-stone-900 tracking-tight">
              6 <span className="text-stone-400 text-2xl font-normal">phases</span>
            </p>
            <p className="mt-2 text-sm text-stone-500 max-w-xs mx-auto md:mx-0">
              From raw alert to a prioritized remediation plan — fully autonomous, with a human confirmation gate on every SEV1.
            </p>
          </div>
          <div className="md:pl-12 pt-8 md:pt-0">
            <p className="text-5xl font-semibold text-stone-900 tracking-tight">
              2<span className="text-stone-400 text-2xl font-normal">-pass</span>
            </p>
            <p className="mt-2 text-sm text-stone-500 max-w-xs mx-auto md:mx-0">
              Triage reasoning — fast snapshot classification, then evidence-refined severity with Datadog signal. Confidence compounds.
            </p>
          </div>
        </div>
      </section>

      {/* ── Pipeline ─────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400 mb-3">The workflow</p>
            <h2 className="text-3xl font-semibold text-stone-900 tracking-tight">
              Alert to remediation. Automatically.
            </h2>
          </div>

          <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Connecting line (desktop) */}
            <div className="absolute top-[1.85rem] left-[10%] right-[10%] h-px bg-stone-200 hidden lg:block pointer-events-none" />

            {PIPELINE.map((step) => (
              <div key={step.n} className="flex flex-col items-start lg:items-center text-left lg:text-center gap-4">
                <div className="relative z-10 w-8 h-8 rounded-full bg-stone-900 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                  {step.n}
                </div>
                <div className={`rounded-2xl border px-4 py-4 w-full ${step.card}`}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <p className={`font-semibold text-sm ${step.text}`}>{step.name}</p>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${step.badge_cls}`}>
                      {step.badge}
                    </span>
                  </div>
                  <p className={`text-xs leading-relaxed opacity-75 ${step.text}`}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-stone-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
              SEV1 incidents pause for human confirmation before remediation executes
            </span>
          </p>
        </div>
      </section>

      {/* ── Live example terminal ─────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-stone-900">
        <div className="max-w-3xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500 mb-8 text-center">
            Live example — web-store AddressError incident
          </p>
          <div className="rounded-2xl bg-stone-950 border border-stone-800 overflow-hidden font-mono">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-stone-800">
              <span className="w-3 h-3 rounded-full bg-rose-500/70" />
              <span className="w-3 h-3 rounded-full bg-amber-500/70" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
              <span className="ml-3 text-stone-500 text-xs">ARIA · web-store · inc-2026-02-21</span>
            </div>
            {/* Log lines */}
            <div className="p-5 space-y-2.5 text-xs leading-6">
              <div>
                <span className="text-stone-600 select-none">alert      </span>
                <span className="text-rose-400">SEV?  </span>
                <span className="text-stone-300">web-store · error_rate=11% · p99=3800ms · started 12m ago</span>
              </div>
              <div>
                <span className="text-stone-600 select-none">triage 01  </span>
                <span className="text-amber-400">→     </span>
                <span className="text-stone-300">SEV1 · recent_deploy · confidence 88% · window 20min</span>
              </div>
              <div>
                <span className="text-stone-600 select-none">datadog    </span>
                <span className="text-sky-400">→     </span>
                <span className="text-stone-300">NameError: already initialized constant AddressError · ×287</span>
              </div>
              <div className="text-stone-600 pl-[6.5rem]">
                shopping_cart_controller.rb:1221 · host web-store-7d9f8b6c4-xk2p9 · trace 4b14ce197e3d06f9
              </div>
              <div>
                <span className="text-stone-600 select-none">cross-svc  </span>
                <span className="text-sky-400">→     </span>
                <span className="text-stone-300">checkout-svc, payment-gateway-svc, notification-svc correlated</span>
              </div>
              <div>
                <span className="text-stone-600 select-none">triage 02  </span>
                <span className="text-amber-400">→     </span>
                <span className="text-stone-300">SEV1 confirmed · confidence 95% · cause: recent_deploy</span>
              </div>
              <div>
                <span className="text-stone-600 select-none">neo4j      </span>
                <span className="text-emerald-400">→     </span>
                <span className="text-stone-300">blast radius: 4 impacted services · 3 runbooks matched</span>
              </div>
              <div>
                <span className="text-stone-600 select-none">rca        </span>
                <span className="text-emerald-400">→     </span>
                <span className="text-stone-300">AddressError autoload regression · probability 85%</span>
              </div>
              <div>
                <span className="text-stone-600 select-none">plan       </span>
                <span className="text-cyan-400">→     </span>
                <span className="text-stone-300">5 actions ready · rollback deploy vab22ck02ef-08f754</span>
              </div>
              <div className="pt-3 border-t border-stone-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                <span className="text-emerald-400">Remediation plan ready. Awaiting engineer approval.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Integrations ─────────────────────────────────────────────────── */}
      <section className="py-28 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400 mb-10">
            Plugs into your existing stack
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {INTEGRATIONS.map((item) => (
              <div
                key={item.name}
                className="rounded-2xl border border-stone-200/70 bg-stone-50/60 px-5 py-5 text-left"
              >
                <p className="font-semibold text-stone-800 text-sm">{item.name}</p>
                <p className="text-xs text-stone-400 mt-1 leading-relaxed">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 border-t border-stone-200/60 text-center">
        <h2 className="text-4xl font-semibold text-stone-900 tracking-tight">
          Ready to close incidents faster?
        </h2>
        <p className="mt-4 text-stone-400 max-w-md mx-auto text-base leading-relaxed">
          Load the demo alert and watch ARIA work in real time. No setup required.
        </p>
        <Link
          href="/console"
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-stone-900 px-8 py-4 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
        >
          Launch ARIA Console <span aria-hidden>→</span>
        </Link>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-stone-200/60 py-8 px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-stone-400">
        <span className="font-medium text-stone-500">ARIA Control Center</span>
        <span>Powered by Claude Sonnet 4.6 · AWS Bedrock · Datadog · Neo4j</span>
      </footer>
    </div>
  );
}
