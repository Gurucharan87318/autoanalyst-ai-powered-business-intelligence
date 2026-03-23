import { useEffect, useMemo, useState } from "react"

type Step = {
  id: string
  title: string
  body: string
  anchorId: string
  placement?: "top" | "bottom" | "left" | "right"
}

type Props = {
  tourKey: string
  steps: Step[]
  onDone?: () => void
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function getAnchorRect(anchorId: string) {
  const el = document.getElementById(anchorId)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r
}

export default function GuidedTour({ tourKey, steps, onDone }: Props) {
  const storageKey = useMemo(() => `tour:${tourKey}:done`, [tourKey])
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const done = localStorage.getItem(storageKey) === "1"
    if (!done) setOpen(true)
  }, [storageKey])

  useEffect(() => {
    if (!open) return
    const onResize = () => setIdx((x) => x)
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onResize, true)
    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onResize, true)
    }
  }, [open])

  if (!open || steps.length === 0) return null

  const step = steps[clamp(idx, 0, steps.length - 1)]
  const rect = getAnchorRect(step.anchorId)

  // If anchor missing, fallback to centered modal-like.
  const vw = window.innerWidth
  const vh = window.innerHeight

  const pad = 12
  const cardW = Math.min(420, vw - pad * 2)

  let top = (vh - 220) / 2
  let left = (vw - cardW) / 2
  let arrow: { side: "top" | "bottom" | "left" | "right"; x: number; y: number } | null = null

  if (rect) {
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2

    const placement = step.placement ?? "bottom"

    if (placement === "bottom") {
      top = rect.bottom + 12
      left = cx - cardW / 2
      arrow = { side: "top", x: cx, y: rect.bottom }
    } else if (placement === "top") {
      top = rect.top - 12 - 220
      left = cx - cardW / 2
      arrow = { side: "bottom", x: cx, y: rect.top }
    } else if (placement === "left") {
      top = cy - 110
      left = rect.left - 12 - cardW
      arrow = { side: "right", x: rect.left, y: cy }
    } else {
      top = cy - 110
      left = rect.right + 12
      arrow = { side: "left", x: rect.right, y: cy }
    }

    top = clamp(top, pad, vh - 260)
    left = clamp(left, pad, vw - cardW - pad)
  }

  const finish = () => {
    localStorage.setItem(storageKey, "1")
    setOpen(false)
    onDone?.()
  }

  const skip = () => finish()

  const next = () => {
    if (idx >= steps.length - 1) finish()
    else setIdx((x) => x + 1)
  }

  const prev = () => setIdx((x) => clamp(x - 1, 0, steps.length - 1))

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(15,23,42,0.45)",
      }}
    >
      {/* highlight box */}
      {rect ? (
        <div
          style={{
            position: "fixed",
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 14,
            border: "2px solid rgba(255,255,255,0.95)",
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.45)",
            pointerEvents: "none",
          }}
        />
      ) : null}

      {/* card */}
      <div
        style={{
          position: "fixed",
          top,
          left,
          width: cardW,
          background: "white",
          borderRadius: 16,
          border: "1px solid #e2e8f0",
          padding: 14,
          boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
        }}
      >
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>
          Tutorial ({idx + 1}/{steps.length})
        </div>
        <div style={{ fontSize: 18, fontWeight: 950, marginTop: 6 }}>{step.title}</div>
        <div style={{ color: "#334155", marginTop: 8, lineHeight: 1.6, fontWeight: 650 }}>
          {step.body}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={skip} style={{ border: 0, background: "transparent", color: "#64748b", fontWeight: 900, cursor: "pointer" }}>
              Skip
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={prev}
              disabled={idx === 0}
              style={{
                border: "1px solid #e2e8f0",
                background: "white",
                padding: "8px 10px",
                borderRadius: 12,
                fontWeight: 900,
                opacity: idx === 0 ? 0.4 : 1,
                cursor: idx === 0 ? "not-allowed" : "pointer",
              }}
            >
              Back
            </button>
            <button
              onClick={next}
              style={{
                border: 0,
                background: "#0f172a",
                color: "white",
                padding: "8px 12px",
                borderRadius: 12,
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              {idx >= steps.length - 1 ? "Finish" : "Continue"}
            </button>
          </div>
        </div>
      </div>

      {/* arrow */}
      {arrow ? (
        <div style={{ position: "fixed", left: arrow.x, top: arrow.y, pointerEvents: "none" }}>
          <div
            style={{
              width: 0,
              height: 0,
              transform: "translate(-50%, -50%)",
              borderStyle: "solid",
              ...(arrow.side === "top"
                ? { borderWidth: "0 10px 12px 10px", borderColor: "transparent transparent white transparent" }
                : arrow.side === "bottom"
                  ? { borderWidth: "12px 10px 0 10px", borderColor: "white transparent transparent transparent" }
                  : arrow.side === "left"
                    ? { borderWidth: "10px 12px 10px 0", borderColor: "transparent white transparent transparent" }
                    : { borderWidth: "10px 0 10px 12px", borderColor: "transparent transparent transparent white" }),
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
