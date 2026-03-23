import React, { useMemo, useEffect, useState } from "react" 
import { useNavigate } from "react-router-dom"
import { isLoggedIn } from "../lib_old/authstate"
import { motion } from "framer-motion"
import { Mail, Linkedin, Github } from "lucide-react"


import logo from "../assets/logo.png"

import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"

// --- ANIMATION VARIANTS ---
const fadeIn = {
  initial: { opacity: 0, y: 18, filter: "blur(6px)" },
  whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: "easeOut" },
} as const

const staggerContainer = {
  initial: {},
  whileInView: { transition: { staggerChildren: 0.09 } },
  viewport: { once: true, margin: "-80px" },
} as const

function Container({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4">{children}</div>
}

const FOUNDER_NOTE_KEY = "autoanalyst:project-notes:v1"

function PageBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 opacity-[0.28] [background-image:linear-gradient(to_right,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:72px_72px]" />

      <motion.div
        initial={{ opacity: 0.7, scale: 1 }}
        animate={{ opacity: [0.55, 0.75, 0.55], scale: [1, 1.04, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-28 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-r from-sky-200/60 via-violet-200/50 to-emerald-200/50 blur-3xl"
      />
      <motion.div
        initial={{ opacity: 0.6, x: 0, y: 0 }}
        animate={{ opacity: [0.45, 0.65, 0.45], x: [0, -18, 0], y: [0, 12, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-44 right-[-120px] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-amber-200/55 to-sky-200/35 blur-3xl"
      />
      <motion.div
        initial={{ opacity: 0.55, x: 0, y: 0 }}
        animate={{ opacity: [0.4, 0.6, 0.4], x: [0, 16, 0], y: [0, -10, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-[58%] left-[-140px] h-[380px] w-[380px] rounded-full bg-gradient-to-br from-indigo-200/45 to-fuchsia-200/25 blur-3xl"
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.75),transparent_55%)]" />
    </div>
  )
}

function SoftDivider() {
  return (
    <div className="py-10 md:py-12">
      <div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-slate-200/70 to-transparent" />
    </div>
  )
}

function SectionHead({
  id,
  eyebrow,
  title,
  desc,
  align = "center",
}: {
  id?: string
  eyebrow?: string
  title: string
  desc?: string
  align?: "center" | "left"
}) {
  return (
    <motion.div
      id={id}
      className={`mx-auto max-w-3xl ${align === "center" ? "text-center" : "text-left"}`}
      {...fadeIn}
    >
      {eyebrow ? (
        <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">{eyebrow}</div>
      ) : null}
      <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-5xl leading-tight">{title}</h2>
      {desc ? <p className="mt-4 text-base leading-relaxed text-slate-600 md:text-lg">{desc}</p> : null}
    </motion.div>
  )
}

function SoftTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200/70 bg-white/60 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur">
      {children}
    </span>
  )
}

function MiniKpi({
  label,
  value,
  hint,
  tint = "slate",
}: {
  label: string
  value: string
  hint: string
  tint?: "slate" | "mint" | "sky" | "violet" | "amber"
}) {
  const tintCls: Record<string, string> = {
    slate: "bg-white/60",
    mint: "bg-emerald-50/70",
    sky: "bg-sky-50/70",
    violet: "bg-violet-50/70",
    amber: "bg-amber-50/70",
  }
  return (
    <div className={`rounded-2xl border border-slate-200/60 ${tintCls[tint]} p-4 shadow-sm backdrop-blur`}>
      <div className="text-[11px] font-semibold tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-600">{hint}</div>
    </div>
  )
}

function WhyNowCard({
  title,
  desc,
  subTitle,
  bullets,
}: {
  title: string
  subTitle?: string
  desc: string
  bullets: string[]
}) {
  return (
    <motion.div
      variants={fadeIn}
      className="rounded-3xl border border-slate-200/60 bg-white/60 p-8 shadow-sm backdrop-blur hover:shadow-md transition-shadow"
    >
      <div className="mb-4">
        {subTitle ? <div className="mb-2 text-xs font-semibold text-slate-500">{subTitle}</div> : null}
        <h3 className="text-xl font-bold text-slate-900">{title}</h3>
      </div>

      <p className="mb-5 text-sm leading-relaxed text-slate-600">{desc}</p>

      <ul className="space-y-2 text-sm text-slate-700">
        {bullets.slice(0, 2).map((b) => (
          <li key={b} className="flex items-start gap-2">
            <span className="mt-0.5 text-slate-900">✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  )
}

function ProductPreview() {
  return (
    <motion.div {...fadeIn} className="rounded-[28px] border border-slate-200/60 bg-white/50 p-4 shadow-sm backdrop-blur">
      <div className="rounded-3xl border border-slate-200/60 bg-white/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-2xl bg-slate-900" />
            <div>
              <div className="text-sm font-semibold text-slate-900">AutoAnalyst</div>
              <div className="text-xs text-muted-foreground">Example dashboard preview</div>
            </div>
          </div>
          <Badge variant="secondary" className="border border-slate-200/60 bg-white/60 backdrop-blur">
            Live preview
          </Badge>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <MiniKpi label="TOTAL SALES" value="₹8.47L" hint="+23.4% vs last month" tint="mint" />
          <MiniKpi label="AVG ORDER" value="₹124" hint="+8.2% improvement" tint="sky" />
          <MiniKpi label="CUSTOMERS" value="6,842" hint="+15.7% growth" tint="violet" />
          <MiniKpi label="GST READY" value="Good" hint="Signals detected" tint="amber" />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2 rounded-2xl border border-slate-200/60 bg-white/60 p-4 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold tracking-wide text-slate-500">REVENUE BY REGION</div>
              <div className="text-xs text-muted-foreground">Auto chart</div>
            </div>

            <div className="mt-4 grid gap-3">
              {[
                { k: "West", w: 86, c: "bg-slate-900" },
                { k: "East", w: 64, c: "bg-slate-700" },
                { k: "North", w: 46, c: "bg-slate-600" },
                { k: "South", w: 34, c: "bg-slate-500" },
              ].map((r) => (
                <div key={r.k} className="flex items-center gap-3">
                  <div className="w-14 text-sm font-medium text-slate-700">{r.k}</div>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${r.c}`} style={{ width: `${r.w}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { t: "Schema", d: "Types, nulls, uniques" },
                { t: "Health", d: "KPIs + alerts" },
                { t: "Export", d: "PNG insight card" },
              ].map((x) => (
                <div
                  key={x.t}
                  className="rounded-xl border border-slate-200/60 bg-white/60 p-3 text-xs text-slate-700 backdrop-blur"
                >
                  <div className="font-semibold">{x.t}</div>
                  <div className="mt-1 text-muted-foreground">{x.d}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/30 bg-slate-900 p-4 text-white shadow-sm">
            <div className="text-xs font-semibold tracking-wide text-slate-300">SUMMARY</div>
            <div className="mt-3 text-sm leading-relaxed text-slate-200">
              Growth is driven by West. Run Health Check to surface anomalies and export a shareable Insight Card.
            </div>

            <div className="mt-4 rounded-xl bg-white/10 p-3">
              <div className="text-xs font-semibold text-slate-200">Suggested next</div>
              <div className="mt-1 text-xs text-slate-300">Investigate missing GSTIN and return spikes.</div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function VisualFeatureCard({
  title,
  desc,
  accent,
  onExplore,
}: {
  title: string
  desc: string
  accent: "sky" | "mint" | "violet" | "amber" | "slate"
  onExplore: () => void
}) {
  const chip: Record<string, string> = {
    slate: "bg-slate-100/80 text-slate-700",
    sky: "bg-sky-100/80 text-sky-800",
    mint: "bg-emerald-100/80 text-emerald-800",
    violet: "bg-violet-100/80 text-violet-800",
    amber: "bg-amber-100/80 text-amber-800",
  }

  const glow: Record<string, string> = {
    slate: "from-slate-200/50 to-slate-200/10",
    sky: "from-sky-200/55 to-sky-200/12",
    mint: "from-emerald-200/55 to-emerald-200/12",
    violet: "from-violet-200/55 to-violet-200/12",
    amber: "from-amber-200/55 to-amber-200/12",
  }

  return (
    <Card className="group relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/60 shadow-sm backdrop-blur hover:shadow-md transition-shadow">
      <div className={`pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-gradient-to-br ${glow[accent]} blur-2xl`} />
      <CardHeader className="relative">
        <div className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${chip[accent]}`}>AutoAnalyst</div>
        <CardTitle className="mt-3 text-base">{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>

      <CardContent className="relative space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="border border-slate-200/60 bg-white/60 backdrop-blur">
            Deterministic
          </Badge>
          <Badge variant="secondary" className="border border-slate-200/60 bg-white/60 backdrop-blur">
            Evidence
          </Badge>
          <Badge variant="secondary" className="border border-slate-200/60 bg-white/60 backdrop-blur">
            Export
          </Badge>
        </div>

        <div className="h-2.5 w-full rounded-full bg-slate-100">
          <div className="h-full w-2/3 rounded-full bg-slate-900/80 transition-all group-hover:w-5/6" />
        </div>

        <Button className="w-full" variant="outline" onClick={onExplore}>
          Explore →
        </Button>
      </CardContent>
    </Card>
  )
}

export default function LandingPage() {
  const nav = useNavigate()

  // ✅ hooks must be inside component
  const [founderOpen, setFounderOpen] = useState(false)
  const [founderAck, setFounderAck] = useState(false)

  const gateTo = (pathIfLoggedIn: string) => {
    if (!isLoggedIn()) {
      nav("/login", { state: { from: pathIfLoggedIn } })
      return
    }
    nav(pathIfLoggedIn)
  }

  const choosePlan = (plan: "free" | "pro" | "custom") => {
    const afterLogin = "/welcome"
    if (!isLoggedIn()) {
      nav("/login", { state: { from: afterLogin, plan } })
      return
    }
    nav(afterLogin)
  }

  const goPricing = () => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })

  const integrations = useMemo(
    () => ["Tally export", "Excel", "Google Sheets", "Zoho Books", "POS export", "Bank statement", "GST export", "Custom CSV"],
    []
  )

useEffect(() => {
  const seen = localStorage.getItem(FOUNDER_NOTE_KEY) // null if first time [web:272]
  if (!seen) setFounderOpen(true)
}, [])



  const features = useMemo(
    () => [
{ title: "Universal Ingestion", desc: "Native support for Tally, Zoho, and messy Excel files with auto-schema cleaning.", accent: "sky" as const, to: "/app/upload" },
{ title: "Offline Privacy", desc: "Local-first workflow. Cloud AI optional; deterministic mode always works.", accent: "slate" as const, to: "/app/upload" },
{ title: "Offline Chat", desc: "Ask questions and get plain answers and next actions.", accent: "violet" as const, to: "/app/transform" },
{ title: "Strategy Engine", desc: "Health check: MoM, MTD, concentration, anomalies, and evidence tables.", accent: "amber" as const, to: "/app/health" },
{ title: "DuckDB Power", desc: "Fast local compute for profiling and transforms—no waiting on servers.", accent: "mint" as const, to: "/app/schema" },
{ title: "Export-ready", desc: "Final board pack + PNG/PDF exports for founder updates and ops reviews.", accent: "sky" as const, to: "/app/final" },

    ],
    []
  )
return (
    <div className="relative min-h-screen bg-white selection:bg-sky-100 selection:text-sky-900 text-slate-900 font-sans">
      <PageBackdrop />

      {/* NAV */}
      <nav className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/60 backdrop-blur-xl transition-all">
        <Container>
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <img src={logo} alt="AutoAnalyst Logo" className=" object-contain drop-shadow-sm  h-[86px] w-[86px]  -translate-y-[-5px] translate-x-[25px] ml-[-7px] mr-2"/>
              <span className="font-bold text-xl tracking-tight text-slate-900">AutoAnalyst</span>
              <Badge variant="secondary" className="bg-slate-100/80 border border-slate-200/60 text-slate-600 font-medium backdrop-blur ml-1">
                Business
              </Badge>
            </div>

            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-500">
              <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-slate-900 transition-colors">
                Features
              </button>
              <button onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-slate-900 transition-colors">
                Demo
              </button>
              <button onClick={() => document.getElementById("vision")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-slate-900 transition-colors">
                Vision
              </button>
              <button onClick={goPricing} className="hover:text-slate-900 transition-colors">
                Pricing
              </button>

              <div className="ml-2 flex items-center gap-3 border-l border-slate-200 pl-6">
                <Button variant="ghost" className="font-semibold text-slate-600 hover:text-slate-900" onClick={() => gateTo("/login")}>
                  Log in
                </Button>
                <Button className="bg-slate-900 text-white font-semibold shadow-sm hover:bg-slate-800 hover:shadow-md transition-all" onClick={() => gateTo("/login")}>
                  Sign up
                </Button>
              </div>
            </div>
          </div>
        </Container>
      </nav>

      {/* HERO */}
      <div className="relative overflow-hidden bg-gradient-to-b from-white to-slate-50/50 pt-20 pb-16 md:pt-28 md:pb-24">
        <Container>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} className="relative">
            
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
              
              {/* LEFT COLUMN - TEXT & CTA */}
              <div className="flex flex-col items-start text-left">
                <div className="flex flex-wrap gap-3 mb-8">
                  <SoftTag>✨ AI-powered</SoftTag>
                  <SoftTag>🔒 Offline-first</SoftTag>
                </div>

                <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 md:text-6xl lg:text-7xl leading-[1.1]">
                  AutoAnalyst <br />
                  AI-assisted <br />
                  <span className="text-slate-400 font-medium">Business Intelligence</span>
                </h1>

                <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-600 font-medium">
                 A Desktop app that turns spreadsheets into dashboards, KPIs, and insights — offline and AI‑driven.
                </p>
                <div className="mt-10 flex flex-wrap gap-4">
                  <Button size="lg" className="h-14 rounded-full px-8 text-base font-semibold shadow-lg shadow-slate-900/10 hover:-translate-y-0.5 transition-transform" onClick={() => gateTo("/welcome")}>
                    Explore
                  </Button>
                  <Button size="lg" variant="outline" className="h-14 rounded-full px-8 text-base font-semibold border-slate-200 bg-white/50 hover:bg-white hover:text-slate-900 transition-all" onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}>
                    Learn More
                  </Button>
                </div>

                <div className="mt-12 flex flex-wrap gap-3 opacity-80">
                  {["CSV/XLSX", "Schema profiling", "PNG insight card", "GST readiness"].map((x) => (
                    <Badge key={x} variant="secondary" className="bg-white/80 text-slate-600 border border-slate-200/60 font-medium px-3 py-1">
                      {x}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* RIGHT COLUMN - IMAGE */}
              <div className="relative mx-auto w-full max-w-lg lg:max-w-none flex justify-center lg:justify-end">
                {/* REPLACE THIS IMG TAG WITH YOUR ACTUAL IMAGE 
                  Keep the classes to ensure it scales correctly within the grid.
                */}
                <img 
                  src="src/assets/logo.png" 
                  alt="AutoAnalyst Architecture Overview" 
                  className="w-full h-auto object-contain drop-shadow-2xl" 
                />
              </div>

            </div>

          </motion.div>
        </Container>
      </div>

      <SoftDivider />

      {/* FEATURES */}
      <section id="features" className="py-16 md:py-24 bg-slate-50/50">
        <Container>
          <div className="mb-16 max-w-3xl text-center mx-auto">
             <motion.p {...fadeIn} className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-3">
              Capabilities
            </motion.p>
             <motion.h2 {...fadeIn} className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl leading-tight">
              The “Digital Munim” your business deserves.
            </motion.h2>
            <motion.p {...fadeIn} className="mt-5 text-lg font-medium text-slate-600">
              From chaos to clarity — instant dashboards, precise feedback, and insights that drive action.
            </motion.p>
          </div>

          <motion.div
            className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            variants={staggerContainer}
            initial="initial"
            whileInView="whileInView"
          >
            {features.map((f, i) => (
              <motion.div key={f.title} variants={fadeIn} className="h-full">
                <div
                  className={`group flex flex-col h-full rounded-[2rem] p-8 transition-all duration-300 border
                  ${
                    i === 0
                      ? "bg-slate-900 border-slate-800 text-white shadow-xl hover:shadow-2xl hover:-translate-y-1"
                      : "bg-white/80 border-slate-200/60 text-slate-900 shadow-sm backdrop-blur-sm hover:shadow-md hover:border-slate-300 hover:-translate-y-1"
                  }`}
                >
                  <h3 className="text-xl font-bold tracking-tight">
                    {f.title}
                  </h3>
                  <p
                    className={`mt-4 mb-8 text-base leading-relaxed flex-grow ${
                      i === 0 ? "text-slate-300 font-medium" : "text-slate-600 font-medium"
                    }`}
                  >
                    {f.desc}
                  </p>
                
                </div>
              </motion.div>
            ))}
          </motion.div>
        </Container>
      </section>

      <SoftDivider />

      {/* DEMO */}
      <section id="demo" className="py-16 md:py-24">
        <Container>
          <SectionHead eyebrow="Interactive Demo" title="See it in action" desc="Instant KPIs, smart charts, and strategic next steps straight from a raw file." />
          <div className="mx-auto mt-14 max-w-5xl rounded-[2.5rem] p-2 bg-gradient-to-b from-slate-100 to-white shadow-2xl shadow-slate-200/50 border border-slate-200/50">
            <ProductPreview />
          </div>

          <motion.div {...fadeIn} className="mt-16 flex flex-wrap items-center justify-center gap-x-12 gap-y-8 opacity-50 grayscale contrast-125 hover:opacity-100 hover:grayscale-0 transition-all duration-500">
            {integrations.slice(0, 6).map((name) => (
              <span key={name} className="text-sm font-extrabold uppercase tracking-[0.2em] text-slate-500 transition-colors hover:text-slate-900">
                {name}
              </span>
            ))}
          </motion.div>
        </Container>
      </section>

      <SoftDivider />

      {/* VISION */}
      <section id="vision" className="py-16 md:py-24 bg-slate-50/50">
        <Container>
          <div className="mb-16 max-w-3xl text-center mx-auto">
            <motion.p {...fadeIn} className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-3">
              The Vision
            </motion.p>
            <motion.h2 {...fadeIn} className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl leading-tight">
              The Co-Operating System™ <br /> for the Future of Work.
            </motion.h2>
            <motion.p {...fadeIn} className="mt-5 text-lg font-medium text-slate-600">
              Establish a repeatable operational rhythm: measure instantly, explain clearly, decide confidently, and share seamlessly.
            </motion.p>
          </div>

          <motion.div className="grid gap-8 md:grid-cols-3" variants={staggerContainer} initial="initial" whileInView="whileInView">
            <WhyNowCard title="AI-Empowered Analytics" subTitle="Insight + Evidence" desc="Know exactly what changed and why with verifiable, drill-down tables." bullets={["MoM / MTD precise signals", "Automated outlier detection"]} />
            <WhyNowCard title="Decision Rhythm" subTitle="Founder / Ops Weekly" desc="Turn static dashboards into clear, accountable next actions." bullets={["Smart alerts & next moves", "1-click Board pack exports"]} />
            <WhyNowCard title="Regenerative Operations" subTitle="Less Chaos, More Flow" desc="Standardize reporting outputs so your entire team moves faster." bullets={["Reusable custom templates", "Clean, presentation-ready exports"]} />
          </motion.div>
        </Container>
      </section>

      <SoftDivider />

      {/* PRICING */}
      <section id="pricing" className="py-16 md:py-24">
        <Container>
          <SectionHead eyebrow="Simple Pricing" title="Choose the right plan" desc="Start entirely for free. Upgrade only when you need higher scale and limits." />

          <motion.div className="mx-auto mt-16 grid max-w-5xl gap-8 lg:grid-cols-3 items-center" variants={staggerContainer} initial="initial" whileInView="whileInView">
            {/* FREE TIER */}
            <motion.div variants={fadeIn} className="rounded-[2rem] border border-slate-200/80 bg-white p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Free</h3>
                <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-semibold border-none">Starter</Badge>
              </div>
              <p className="mb-6 text-sm font-medium text-slate-500 h-10">Experience the full workflow on smaller data limits.</p>
              <div className="mb-8 text-5xl font-extrabold tracking-tight text-slate-900">₹0</div>
              <ul className="mb-8 space-y-4 font-medium">
                {["Universal Upload", "Schema Detection", "Visual Dashboard", "Retail Health Check", "GST Preview (Limited)"].map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-slate-600">
                    <span className="text-slate-900 font-bold">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Button className="w-full h-12 text-base font-bold bg-slate-100 text-slate-900 hover:bg-slate-200 transition-colors" onClick={() => choosePlan("free")}>
                Get started for free
              </Button>
            </motion.div>

            {/* PRO TIER */}
            <motion.div variants={fadeIn} className="relative rounded-[2rem] border-2 border-slate-900 bg-white p-8 shadow-2xl shadow-slate-900/10 hover:-translate-y-2 transition-transform z-10">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-1 rounded-full text-xs font-bold tracking-wide uppercase">Most Popular</div>
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Pro</h3>
                <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100 font-bold border-none">Business</Badge>
              </div>
              <p className="mb-6 text-sm font-medium text-slate-500 h-10">For MSMEs running this operating rhythm weekly.</p>
              <div className="mb-8 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold tracking-tight text-slate-900">₹X,XXX</span>
                <span className="text-base font-medium text-slate-500">/ yr</span>
              </div>
              <ul className="mb-8 space-y-4 font-medium">
                {["Everything in Free", "Higher limits (GST/Exports)", "Saved analytic templates", "Priority email support"].map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-slate-700">
                    <span className="text-sky-600 font-bold">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Button className="w-full h-12 text-base font-bold bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-900/20 transition-all" onClick={() => choosePlan("pro")}>
                Choose Pro
              </Button>
            </motion.div>

            {/* CUSTOM TIER */}
            <motion.div variants={fadeIn} className="rounded-[2rem] border border-slate-200/80 bg-white p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Custom</h3>
                <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-semibold border-none">CA / Agency</Badge>
              </div>
              <p className="mb-6 text-sm font-medium text-slate-500 h-10">Multi-client workflows and deeper custom validations.</p>
              <div className="mb-8 text-5xl font-extrabold tracking-tight text-slate-900">Let’s talk</div>
              <ul className="mb-8 space-y-4 font-medium">
                {["Multi-client workspace", "Standardized firm exports", "Custom health checks", "White-glove onboarding"].map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-slate-600">
                    <span className="text-slate-900 font-bold">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full h-12 text-base font-bold border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors" onClick={() => choosePlan("custom")}>
                Contact Sales
              </Button>
            </motion.div>
          </motion.div>

          <div className="mt-12 text-center text-sm font-medium text-slate-400">
            Annual-first pricing designed for growing businesses. Monthly options can be negotiated.
          </div>
        </Container>
      </section>

      {/* FOOTER */}
      <footer className="mt-12 bg-slate-950 text-slate-300">
        <Container>
          <div className="grid gap-12 border-t border-white/10 py-16 md:grid-cols-5">
  <div className="md:col-span-2 pr-8">
    
    <div className="flex items-center gap-3">
      <img 
        src={logo} 
        alt="AutoAnalyst Logo" 
        className="object-contain drop-shadow-sm h-[86px] w-[86px] translate-y-[5px] translate-x-[25px] -ml-[7px] mr-2"
      />
      <div className="text-lg font-bold text-white tracking-tight">
        AutoAnalyst
      </div>
    </div>

    <p className="mt-5 text-sm leading-relaxed text-slate-400 font-medium max-w-sm">
      From messy raw exports to strategic decisions in minutes. Built offline-first and business-grade for modern operators.
    </p>

  </div>


            <div>
              <div className="text-sm font-bold text-white uppercase tracking-wider mb-5">Product</div>
              <div className="grid gap-3 text-sm font-medium">
                <button className="text-left hover:text-white transition-colors w-fit" onClick={() => gateTo("/feature/FileUpload")}>Universal Upload</button>
                <button className="text-left hover:text-white transition-colors w-fit" onClick={() => gateTo("/app/Schema ")}>Schema Detection</button>
                <button className="text-left hover:text-white transition-colors w-fit" onClick={() => gateTo("/feature/retail-health")}>Retail Health Check</button>
                <button className="text-left hover:text-white transition-colors w-fit" onClick={() => gateTo("/feature/welcome")}>GST Preview</button>
              </div>
            </div>

            <div>
              <div className="text-sm font-bold text-white uppercase tracking-wider mb-5">Contact</div>
              <div className="grid gap-3 text-sm font-medium">
                <button className="text-left hover:text-white transition-colors w-fit" onClick={() => setFounderOpen(true)}>Project Terms</button>
               <a
  className="flex items-center gap-2 transition-colors hover:text-white w-fit"
  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent("gurucharansenthilkumar04@gmail.com")}&su=${encodeURIComponent("AutoAnalyst - Contact")}`}
  target="_blank"
  rel="noopener noreferrer"
>
  <Mail className="h-4 w-4" /> Email
</a>

<a
  className="flex items-center gap-2 transition-colors hover:text-white w-fit"
  href="https://www.linkedin.com/in/gurucharansenthilkumar"
  target="_blank"
  rel="noopener noreferrer"
>
  <Linkedin className="h-4 w-4" /> LinkedIn
</a>

<a
  className="flex items-center gap-2 transition-colors hover:text-white w-fit"
  href="https://github.com/Gurucharan87318/"
  target="_blank"
  rel="noopener noreferrer"
>
  <Github className="h-4 w-4" /> GitHub
</a>

              </div>
            </div>

            <div>
              <div className="text-sm font-bold text-white uppercase tracking-wider mb-5">Get started</div>
              <p className="text-sm font-medium text-slate-400 mb-4 leading-relaxed">
                Choose a plan to create your workspace. You’ll be routed to the Welcome dashboard.
              </p>
              <Button variant="secondary" className="bg-white/10 text-white hover:bg-white/20 border-none font-semibold w-full" onClick={() => choosePlan("free")}>
                Start Exploring
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-white/10 py-8 text-sm font-medium text-slate-500 md:flex-row md:items-center md:justify-between">
            <div>© {new Date().getFullYear()} AutoAnalyst. All rights reserved.</div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Built for MSMEs and CAs in India.
            </div>
          </div>
        </Container>
      </footer>

      {/* MODAL */}
      {founderOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => { setFounderOpen(false); setFounderAck(false); }}
            aria-label="Close"
          />

          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }} 
            animate={{ opacity: 1, scale: 1, y: 0 }} 
            className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white text-slate-900 shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-8 py-6 bg-slate-50/50">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Project Notes</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  How this MVP was built and how to use it responsibly.
                </p>
              </div>
              <button
                className="rounded-full p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                onClick={() => { setFounderOpen(false); setFounderAck(false); }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-8 py-6 overflow-y-auto custom-scrollbar text-sm leading-relaxed text-slate-600 font-medium space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 mb-2">Why AutoAnalyst exists</h3>
                <p>
                  AutoAnalyst is an early-stage startup MVP designed to eliminate repetitive analytics work — data exports, cleaning, dashboard creation, and manual reporting — so teams can focus on high-impact decisions instead of operational overhead.
                </p>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 mb-2">What This MVP Includes</h3>
                <p>
                  An offline-first analytics workflow: Universal Data Upload → Automated Schema Detection → AI-Enhanced Visual Dashboard → Data Health Monitoring → Structured Insight Exports.
                </p>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 mb-2">Intellectual Property & Usage</h3>
                <p>
                  All product flows, interface designs, written content, and technical implementations are the intellectual property of the project. You are welcome to review and evaluate the MVP for learning or collaboration purposes. However, reproduction, redistribution, or commercial reuse of the design, codebase, or assets without permission is not permitted.
                </p>
              </div>

              {/* Acknowledgment Box */}
              <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/50 p-5">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center mt-0.5">
                    <input
                      type="checkbox"
                      className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-slate-300 checked:border-slate-900 checked:bg-slate-900 transition-all"
                      checked={founderAck}
                      onChange={(e) => setFounderAck(e.target.checked)}
                    />
                    <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                    I acknowledge that this MVP’s design, codebase, and assets are protected intellectual property and agree not to copy, reproduce, or redistribute them without permission.
                  </span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 px-8 py-5 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-xs font-semibold text-slate-400">
                We’re open to collaboration. Connect with us to shape the future together.
              </span>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto h-11 px-6 font-bold border-slate-200 text-slate-600 hover:bg-white hover:text-slate-900"
                  onClick={() => { setFounderOpen(false); setFounderAck(false); }}
                >
                  Cancel
                </Button>
                <Button
                  className={`w-full sm:w-auto h-11 px-6 font-bold transition-all shadow-sm ${
                    founderAck
                      ? "bg-slate-900 text-white hover:bg-slate-800 hover:shadow-md"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed hover:bg-slate-200"
                  }`}
                  disabled={!founderAck}
                  onClick={() => {
                    localStorage.setItem(FOUNDER_NOTE_KEY, "seen");
                    setFounderOpen(false);
                    setFounderAck(false);
                  }}
                >
                  Understood
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
)}