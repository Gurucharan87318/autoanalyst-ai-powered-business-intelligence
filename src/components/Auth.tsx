import { useLocation, useNavigate, Navigate } from "react-router-dom"
import { JSX, useState } from "react"

import { isLoggedIn, setLoggedIn } from "../lib_old/authstate"

function fromLocation(loc: any) {
  return loc?.state?.from ?? "/welcome"
}

export function RequireAuth({ children }: { children: JSX.Element }) {
  const loc = useLocation()

  if (!isLoggedIn()) {
    const from = loc.pathname + (loc.search ?? "") + (loc.hash ?? "")
    return <Navigate to="/login" replace state={{ from }} />
  }

  return children
}

export function Login() {
  const nav = useNavigate()
  const loc = useLocation() as any

  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)

  const next = fromLocation(loc)

  const submit = async () => {
    const v = value.trim()
    if (!v || busy) return

    setBusy(true)
    try {
      await loginMock(v)
      setLoggedIn(true)
      nav(next, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-xs font-black uppercase tracking-wider text-slate-500">Login</div>
        <div className="text-2xl font-black tracking-tight text-slate-900 mt-2">Access your workspace</div>
        <div className="text-sm text-slate-600 mt-2">
          Enter email or phone. (OTP can be added later; this is MVP gate.)
        </div>

        <div className="mt-4 space-y-3">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Email or phone"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              fontWeight: 800,
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit()
            }}
          />

          <button
            disabled={busy || !value.trim()}
            onClick={submit}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 14,
              fontWeight: 900,
              background: busy ? "#94a3b8" : "#0f172a",
              color: "white",
              border: "none",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Signing in..." : "Continue"}
          </button>

          <button
            onClick={() => nav("/", { replace: true })}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 14,
              fontWeight: 900,
              background: "white",
              color: "#0f172a",
              border: "1px solid #e2e8f0",
              cursor: "pointer",
            }}
          >
            Back to Home
          </button>

          <div className="text-[11px] text-slate-500">
            After login you’ll be redirected to: <span className="font-bold">{String(next)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
function loginMock(v: string) {
  throw new Error("Function not implemented.")
}

