import { useEffect, useMemo, useRef, useState } from "react"
import { X, EyeOff, RotateCcw, Copy, Download } from "lucide-react"
import { toast } from "sonner"

import { useDatasetStore } from "../lib_old/DatasetStore"
import { offlineAsk } from "../lib_old/OfflineChat"

import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Input } from "../components/ui/input"

type Msg = {
  id: string
  role: "user" | "assistant"
  text: string
  at: number
}

const LS_OPEN = "aa_nlchat_open"
const LS_HIDDEN = "aa_nlchat_hidden"

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16)
}

function readBool(k: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(k)
    if (v === null) return fallback
    return v === "1"
  } catch {
    return fallback
  }
}

function writeBool(k: string, v: boolean) {
  try {
    localStorage.setItem(k, v ? "1" : "0")
  } catch {}
}

function cleanText(s: string) {
  return String(s ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function isOfflineFallbackText(t: string) {
  const s = cleanText(t)
  if (!s) return false
  return (
    s.startsWith("I can help with:") ||
    s.includes("Data (offline): total <metric>") ||
    s.includes('Try: "help"') ||
    s.includes('Try: "help" or "workflow"') ||
    s.includes("Try: help")
  )
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function autoanalystAbout() {
  return cleanText(
    "Hi! I'm AutoAnalyst. I'm an offline-first tool designed to help you turn CSV or Excel files into clear insights.\n\n" +
      "I can help you build dashboards, detect data schemas, and check the health of your numbers—all without your data ever leaving your computer."
  )
}

function minimalHelp(hasDataset: boolean) {
  if (!hasDataset) return "I'd love to help, but I'll need you to upload a dataset first so I have some data to look at!"
  return cleanText(
    "Im running in offline mode at the moment, which means I can’t process your request. Thanks for your patience!"
  )
}

export default function NLChat() {
  const { dataset } = useDatasetStore() as any
  const hasDataset = !!dataset

  const [hidden, setHidden] = useState(() => readBool(LS_HIDDEN, false))
  const [open, setOpen] = useState(() => readBool(LS_OPEN, true))
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState("")

  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: uid(),
      role: "assistant",
      at: Date.now(),
      text: hasDataset ? "Hi there! What would you like to know about your data?" : "Hello! Once you upload a dataset, I can help you analyze it. Ready when you are!",
    },
  ])

  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => writeBool(LS_OPEN, open), [open])
  useEffect(() => writeBool(LS_HIDDEN, hidden), [hidden])

  useEffect(() => {
    setMsgs((m) => {
      if (!m.length) return m
      const first = m[0]
      const next = hasDataset ? "Hi there! What would you like to know about your data?" : "Hello! Once you upload a dataset, I can help you analyze it. Ready when you are!"
      if (first.role === "assistant" && first.text !== next) return [{ ...first, text: next }, ...m.slice(1)]
      return m
    })
  }, [hasDataset])

  const chips = useMemo(
    () => [
      { label: "What is this?", q: "what is autoanalyst" },
      { label: "How it works", q: "workflow" },
      { label: "Give me examples", q: "help" },
    ],
    []
  )

  const scrollDown = () => {
    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }), 0)
  }

  const push = (role: Msg["role"], text: string) => {
    const msg: Msg = { id: uid(), role, at: Date.now(), text: cleanText(text) }
    setMsgs((m) => {
      const next = [...m, msg]
      return next.length > 60 ? next.slice(next.length - 60) : next
    })
    scrollDown()
  }

  const resetChat = () => {
    setMsgs([
      { id: uid(), role: "assistant", at: Date.now(), text: hasDataset ? "Chat cleared. What's on your mind?" : "Starting fresh! Just upload a dataset to get started." },
    ])
    toast.message("Conversation reset")
  }

  const copyLastAnswer = async () => {
    const last = [...msgs].reverse().find((m) => m.role === "assistant")
    if (!last) return
    try {
      await navigator.clipboard.writeText(last.text)
      toast.message("Copied to clipboard")
    } catch {
      toast.message("Couldn't copy text")
    }
  }

  const exportTranscript = () => {
    const lines = msgs.map((m) => {
      const ts = new Date(m.at).toLocaleString()
      const tag = m.role === "user" ? "You" : "AutoAnalyst"
      return `[${ts}] ${tag}: ${m.text}`
    })
    downloadText(`AutoAnalyst-Chat-${new Date().toISOString().slice(0, 10)}.txt`, lines.join("\n\n"))
    toast.message("Transcript downloaded")
  }

  const answerProduct = (t: string) => {
    const s = t.toLowerCase().trim()
    if (s.includes("what is autoanalyst") || s === "autoanalyst" || s.includes("what is this")) return autoanalystAbout()
    if (s.includes("workflow") || s.includes("how it works")) {
      return cleanText(
        "The process is pretty straightforward: first we upload your file, then I detect the structure, we build your dashboard, and finally you can export the cleaned results.\n\n" +
          "The goal is to get you from raw data to clean KPIs as quickly as possible!"
      )
    }
    if (s === "help" || s.includes("examples")) return minimalHelp(hasDataset)
    return null
  }

  const send = async (text: string) => {
    const t = cleanText(text)
    if (!t || busy) return

    push("user", t)
    setQ("")
    setBusy(true)

    try {
      const product = answerProduct(t)
      if (product) {
        push("assistant", product)
        return
      }

      if (!dataset) {
        push("assistant", "I'm ready to help, but I need some data first! Please upload a file to start.")
        return
      }

      const replies = offlineAsk(dataset, t)
      const texts: string[] = []

      for (const r of replies ?? []) {
        if (r?.kind === "text") {
          const msg = cleanText(r.text ?? "")
          if (!msg) continue
          if (isOfflineFallbackText(msg)) continue 
          texts.push(msg)
        } else if (r?.kind === "table") {
          const title = cleanText(r.title ?? "Result")
          const n = Array.isArray(r.rows) ? r.rows.length : 0
          texts.push(cleanText(`I found ${n} rows for "${title}".`))
        }
      }

      if (texts.length) {
        push("assistant", texts.slice(0, 2).join("\n\n"))
      } else {
        push("assistant", " " + minimalHelp(true))
      }
    } finally {
      setBusy(false)
    }
  }

  const ChatIcon = () => (
    <div className="relative grid place-items-center h-10 w-10 rounded-full bg-slate-900 text-white shadow-lg">
      <div className="text-[13px] font-black tracking-tight">Ai</div>
      <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
    </div>
  )

  if (hidden) {
    return (
      <div className="fixed bottom-5 right-5 z-50">
        <button
          className="flex items-center gap-3 rounded-full bg-white/80 backdrop-blur border border-white/40 shadow-xl px-3 py-2 hover:bg-white"
          onClick={() => {
            setHidden(false)
            setOpen(true)
          }}
        >
          <ChatIcon />
          <div className="text-sm font-semibold text-slate-900">Chat with me</div>
        </button>
      </div>
    )
  }

  return (
    <>
      {!open ? (
        <div className="fixed bottom-5 right-5 z-50">
          <button
            className="flex items-center gap-3 rounded-full bg-white/80 backdrop-blur border border-white/40 shadow-xl px-3 py-2 hover:bg-white"
            onClick={() => setOpen(true)}
          >
            <ChatIcon />
            <div className="text-sm font-semibold text-slate-900">Open Chat</div>
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="fixed bottom-5 right-5 z-50 w-[340px] sm:w-[420px]">
          <div className="relative overflow-hidden rounded-2xl border border-white/35 bg-white/75 shadow-2xl backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-900/5 via-transparent to-slate-900/10" />

            <div className="relative flex items-center justify-between border-b border-white/30 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <ChatIcon />
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-900 truncate">AutoAnalyst Chat</div>
                  <div className="text-[11px] text-slate-600 truncate">I'm currently offline</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="max-w-[160px] truncate">
                  {dataset?.meta?.name ?? "No data loaded"}
                </Badge>

                <button
                  className="rounded-lg border border-white/40 bg-white/60 p-2 hover:bg-white/80"
                  title="Minimize"
                  onClick={() => {
                    setOpen(false)
                    setHidden(true)
                  }}
                >
                  <EyeOff className="h-4 w-4 text-slate-700" />
                </button>

                <button
                  className="rounded-lg border border-white/40 bg-white/60 p-2 hover:bg-white/80"
                  title="Close"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4 text-slate-700" />
                </button>
              </div>
            </div>

            <div className="relative px-3 pt-3">
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => send(c.q)}
                    className="rounded-full border border-white/40 bg-white/60 px-3 py-1 text-[12px] font-semibold text-slate-700 hover:bg-white/85"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div ref={listRef} className="relative h-[260px] overflow-auto px-3 py-3">
              <div className="space-y-2">
                {msgs.map((m) => {
                  const isUser = m.role === "user"
                  return (
                    <div
                      key={m.id}
                      className={[
                        "max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed",
                        isUser
                          ? "ml-auto bg-slate-900 text-white"
                          : "bg-white/70 text-slate-800 border border-white/40",
                      ].join(" ")}
                    >
                      {m.text}
                    </div>
                  )
                })}
                {busy ? <div className="text-xs text-slate-500 italic">Thinking...</div> : null}
              </div>
            </div>

            <div className="relative border-t border-white/30 p-3 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={resetChat}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Clear
                </Button>
                <Button size="sm" variant="outline" onClick={copyLastAnswer}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
                <Button size="sm" variant="outline" onClick={exportTranscript}>
                  <Download className="mr-2 h-4 w-4" />
                  Save Chat
                </Button>
              </div>

              <div className="flex gap-2">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Type your message..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send(q)
                  }}
                />
                <Button onClick={() => send(q)} disabled={busy}>
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}