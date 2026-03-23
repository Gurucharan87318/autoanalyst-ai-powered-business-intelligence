import { useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

const FEATURE_COPY: Record<string, { title: string; subtitle: string }> = {
  "get-started": {
    title: "Get Started",
    subtitle: "This page will become your upload → dashboard flow.",
  },
  "universal-upload": {
    title: "Universal Data Upload",
    subtitle: "CSV/Excel/Text paste support.",
  },
  "schema-detection": {
    title: "Smart Schema Detection",
    subtitle: "Type inference, null profiling, distributions.",
  },
  "auto-dashboards": {
    title: "Auto Dashboards",
    subtitle: "5–7 charts auto-generated.",
  },
  "kpi-highlights": {
    title: "KPI Highlights",
    subtitle: "Auto KPIs + trends.",
  },
  "nl-chat": {
    title: "Natural Language Chat",
    subtitle: "Ask questions, get answers and charts.",
  },
  "offline-sql": {
    title: "Offline SQL CLI",
    subtitle: "Run SQL locally on your dataset.",
  },
  privacy: { title: "Privacy", subtitle: "Write a privacy policy page here." },
  terms: { title: "Terms", subtitle: "Write terms of service here." },
  contact: { title: "Contact", subtitle: "Add your email + links here." },
}

export default function FeaturePage() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const data = useMemo(() => {
    const s = slug ?? "get-started"
    return FEATURE_COPY[s] ?? { title: "Feature", subtitle: "Coming soon." }
  }, [slug])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="gradient-mesh">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="text-sm text-muted-foreground">Feature</div>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
                {data.title}
              </h1>
              <p className="mt-3 text-slate-600">{data.subtitle}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary">Placeholder</Badge>
                <Badge variant="outline">/{slug ?? "get-started"}</Badge>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/")}>
                ← Back
              </Button>
              <Button onClick={() => navigate("/pricing")}>Pricing</Button>
            </div>
          </div>

          <Card className="card-shadow mt-8">
            <CardHeader>
              <CardTitle>What this page is</CardTitle>
              <CardDescription>
                A clean placeholder for routes you’ll build later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-700">
              <div>
                This route exists so every <Badge variant="secondary">/feature/:slug</Badge> link
                renders something consistent.
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="font-medium">Next refactor</div>
                <div>
                  Create dedicated pages in <Badge variant="outline">src/Features</Badge> and keep
                  everything on shadcn + Tailwind (no separate FeatureStyles folder).
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => navigate("/feature/universal-upload")}>
                  Open Upload
                </Button>
                <Button variant="outline" onClick={() => navigate("/feature/schema-detection")}>
                  Open Schema
                </Button>
                <Button variant="outline" onClick={() => navigate("/feature/visual-dashboard")}>
                  Open Dashboard
                </Button>
                <Button onClick={() => navigate("/feature/nl-chat")}>Open NL Chat</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
