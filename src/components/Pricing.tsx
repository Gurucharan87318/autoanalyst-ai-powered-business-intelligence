import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { isLoggedIn } from "../lib_old/authstate"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

function Tick({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-slate-700">
      <span className="mt-[2px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-xs">
        ✓
      </span>
      <span>{children}</span>
    </div>
  )
}

export default function Pricing() {
  const nav = useNavigate()
  const loc = useLocation() as any

  // Optional: if URL has #pricing, scroll cleanly on load
  useEffect(() => {
    if (window.location.hash === "#pricing") {
      document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })
    }
  }, [])

 const choosePlan = (plan: "free" | "pro" | "custom") => {
  const afterLogin = "/welcome"

  if (!isLoggedIn()) {
    nav("/login", { state: { from: afterLogin, plan } })
    return
  }

  nav(afterLogin)
}

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="gradient-mesh">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="text-sm text-muted-foreground">Pricing</div>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
                Plans for MSMEs, teams, and CAs
              </h1>
              <p className="mt-3 text-slate-600">
                Login is required for all users. Start with Free and upgrade when it saves you hours every month.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary">Annual-first</Badge>
                <Badge variant="secondary">Offline-first (V1)</Badge>
                <Badge variant="secondary">India-first outputs</Badge>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => nav("/")}>
                ← Home
              </Button>
              <Button onClick={() => nav("/login", { state: { from: "/welcome" } })}>
                Login →
              </Button>
            </div>
          </div>

          {/* Anchor target for landing scroll */}
          <div id="pricing" className="pt-8" />

          <div className="mt-2 grid gap-6 lg:grid-cols-3">
            {/* Free */}
            <Card className="card-shadow">
              <CardHeader>
                <CardTitle>Free</CardTitle>
                <CardDescription>Perfect to experience the full flow once.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end justify-between">
                  <div className="text-3xl font-semibold">₹0</div>
                  <Badge variant="secondary">Individual</Badge>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Tick>Retail Health Check + export PNG</Tick>
                  <Tick>Universal Upload (CSV/XLSX)</Tick>
                  <Tick>Schema Detection</Tick>
                  <Tick>Visual Dashboard</Tick>
                  <Tick>GST Preview (limited / month)</Tick>
                  <Tick>Offline-first (per device)</Tick>
                </div>

                <Button className="w-full" onClick={() => choosePlan("free")}>
                  Choose Free →
                </Button>

                <div className="text-xs text-muted-foreground">
                  Login required. After login, you land on Welcome.
                </div>
              </CardContent>
            </Card>

            {/* Pro */}
            <Card className="card-shadow border-slate-900">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Pro</CardTitle>
                  <Badge>Business</Badge>
                </div>
                <CardDescription>For owners & teams running this weekly.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end justify-between">
                  <div className="text-3xl font-semibold">₹9,999</div>
                  <div className="text-sm text-muted-foreground">/year</div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Tick>Everything in Free</Tick>
                  <Tick>Higher GST checks & exports</Tick>
                  <Tick>Saved views + reusable templates</Tick>
                  <Tick>Priority support</Tick>
                  <Tick>Team workflows (basic)</Tick>
                </div>

                <Button className="w-full" onClick={() => choosePlan("pro")}>
                  Choose Pro →
                </Button>

                <div className="text-xs text-muted-foreground">
                  Annual is recommended for MSMEs; we can add monthly later.
                </div>
              </CardContent>
            </Card>

            {/* Custom */}
            <Card className="card-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Custom</CardTitle>
                  <Badge variant="secondary">CA / Dedicated</Badge>
                </div>
                <CardDescription>Multi-client workflows + deeper validations.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end justify-between">
                  <div className="text-3xl font-semibold">Let’s talk</div>
                  <Badge variant="outline">SLA</Badge>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Tick>Multi-client workspace</Tick>
                  <Tick>Standardized exports for review & filing</Tick>
                  <Tick>Custom checks (GST, ledger hygiene, anomaly rules)</Tick>
                  <Tick>Onboarding + training</Tick>
                  <Tick>Priority support</Tick>
                </div>

                <Button variant="outline" className="w-full" onClick={() => choosePlan("custom")}>
                  Choose Custom →
                </Button>

                <div className="text-xs text-muted-foreground">
                  After login, we’ll show a contact / onboarding flow (V2).
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="card-shadow mt-6">
            <CardHeader>
              <CardTitle className="text-base">How it works</CardTitle>
              <CardDescription>Login → Upload → Schema → Outputs.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3 text-sm text-slate-700">
              <div>
                <div className="font-medium">1) Login (mandatory)</div>
                <div className="text-muted-foreground">MVP gate now; later OTP + billing.</div>
              </div>
              <div>
                <div className="font-medium">2) Upload exports</div>
                <div className="text-muted-foreground">CSV/XLSX from Tally/Zoho/Sheets.</div>
              </div>
              <div>
                <div className="font-medium">3) Generate outputs</div>
                <div className="text-muted-foreground">Dashboards + Health Check + PNG export.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
