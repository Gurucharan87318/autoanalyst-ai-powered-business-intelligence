import { useLocation, useNavigate } from "react-router-dom"
import { useState } from "react"
import { setLoggedIn } from "../lib_old/authstate"

export default function Login() {
  const nav = useNavigate()
  const loc = useLocation() as any
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)

  const next = loc?.state?.from ?? "/welcome"

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
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 24, fontFamily: "Inter, system-ui" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", background: "white", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18 }}>
        <h1 style={{ fontSize: 30, margin: "6px 0 10px", fontWeight: 900 }}>Login</h1>
        <p style={{ color: "#64748b", marginTop: 0, lineHeight: 1.7 }}>
          Enter email or phone. (OTP can be added later; this is MVP gate.)
        </p>

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
          onClick={submit}
          disabled={!value.trim() || busy}
          style={{
            marginTop: 12,
            width: "100%",
            border: 0,
            background: "#0f172a",
            color: "white",
            padding: "12px 14px",
            borderRadius: 14,
            fontWeight: 950,
            opacity: value.trim() && !busy ? 1 : 0.6,
            cursor: value.trim() && !busy ? "pointer" : "not-allowed",
          }}
        >
          {busy ? "Signing in…" : "Continue"}
        </button>
      </div>
    </div>
  )
}
function loginMock(v: string) {
  throw new Error("Function not implemented.")
}

