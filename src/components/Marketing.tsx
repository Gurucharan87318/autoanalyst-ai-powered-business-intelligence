import { useMemo } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { isLoggedIn } from "../lib_old/authstate"

import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Separator } from "../components/ui/separator"

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, ease: "easeOut" },
} as const

const staggerContainer = {
  initial: {},
  whileInView: { transition: { staggerChildren: 0.1 } },
  viewport: { once: true },
} as const

function Container({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 md:px-6">{children}</div>
}

function SectionTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-black uppercase tracking-wider text-slate-500">{title}</div>
      <div className="text-sm text-slate-600">{desc}</div>
    </div>
  )
}

function PricingBlock({ onCTA }: { onCTA: () => void }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle>Pricing</CardTitle>
        <CardDescription>Start free. Upgrade when it saves you hours every month.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base">Free</CardTitle>
              <CardDescription>Try the full workflow on smaller limits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              <div>Upload CSV/XLSX</div>
              <div>Schema detection</div>
              <div>Visual dashboard</div>
              <div>Health check</div>
              <Button className="w-full bg-slate-900 text-white hover:bg-slate-800" onClick={onCTA}>
                Start free
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base">Pro</CardTitle>
              <CardDescription>For MSMEs running this workflow weekly.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              <div>Higher limits</div>
              <div>Saved boards + exports</div>
              <div>AI narration add-on</div>
              <div>Collaboration tasks</div>
              <Button variant="outline" className="w-full" onClick={onCTA}>
                Continue to app
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base">Team</CardTitle>
              <CardDescription>Multi-client workflows and deeper validations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              <div>RBAC + sharing</div>
              <div>Templates + governance</div>
              <div>Scheduling (later)</div>
              <div>Audit trail</div>
              <Button variant="outline" className="w-full" onClick={onCTA}>
                Talk to us
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-xs text-slate-500">
          Login is required for feature pages. Marketing pages are visible without login.
        </div>
      </CardContent>
    </Card>
  )
}

export function LandingPage() {
  const nav = useNavigate()
  const loc = useLocation()

  const primaryCTA = useMemo(() => {
    // If already logged in, go straight to welcome. Otherwise, login first.
    return isLoggedIn() ? "/welcome" : "/welcome"
  }, [])

  const goCTA = () => {
    nav(primaryCTA, { state: { from: loc.pathname } })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Container>
        <div className="py-8 md:py-12 space-y-8">
          <motion.div {...fadeIn} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">v1 Public Beta</Badge>
              <Badge variant="secondary">Local-first</Badge>
              <Badge variant="secondary">Finance-ready</Badge>
            </div>

            <div className="text-3xl md:text-5xl font-black tracking-tight text-slate-900">
              AutoAnalyst
            </div>
            <div className="text-slate-600 max-w-2xl">
              Upload data. Get instant dashboards, Health OS signals, and a board-pack final report—without endless
              spreadsheets or PowerBI edits.
            </div>

            <div className="flex flex-wrap gap-2">
              <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={goCTA}>
                {isLoggedIn() ? "Go to Welcome" : "Login to start"}
              </Button>
              <Button variant="outline" onClick={() => nav("/app/pricing")}>
                View pricing
              </Button>
            </div>
          </motion.div>

          <Separator />

          <motion.div {...staggerContainer} className="grid gap-4 md:grid-cols-3">
            <motion.div {...fadeIn}>
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Fast lane workflow</CardTitle>
                  <CardDescription>File → Schema → Visual → Health → Final.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-slate-700 space-y-2">
                  <div>Deterministic KPIs + optional AI narration.</div>
                  <div>Evidence tables for anomalies and concentration.</div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div {...fadeIn}>
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">PowerBI-like boards</CardTitle>
                  <CardDescription>KPIs, trends, mix, and evidence—ready to export.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-slate-700 space-y-2">
                  <div>MoM + MTD intelligence.</div>
                  <div>Pareto and anomaly watchlists.</div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div {...fadeIn}>
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Health OS</CardTitle>
                  <CardDescription>Alerts, next moves, and tasks—ops-ready.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-slate-700 space-y-2">
                  <div>Freshness + data parse quality.</div>
                  <div>Concentration and volatility risks.</div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>

          <SectionTitle title="Pricing" desc="Choose a plan when it saves you time." />
          <PricingBlock onCTA={goCTA} />
        </div>
      </Container>
    </div>
  )
}

export function Pricing() {
  const nav = useNavigate()
  const loc = useLocation()
  const goCTA = () => nav(isLoggedIn() ? "/app/welcome" : "/app/welcome", { state: { from: loc.pathname } })

  return (
    <div className="min-h-screen bg-slate-50">
      <Container>
        <div className="py-8 md:py-12 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="space-y-1">
              <div className="text-sm font-bold">Pricing</div>
              <div className="text-xs text-slate-600">Start with Free and upgrade later.</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => nav("/")}>
                Home
              </Button>
              <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={goCTA}>
                {isLoggedIn() ? "Continue" : "Login"}
              </Button>
            </div>
          </div>

          <PricingBlock onCTA={goCTA} />
        </div>
      </Container>
    </div>
  )
}
