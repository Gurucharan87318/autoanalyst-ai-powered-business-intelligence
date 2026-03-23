import { Navigate, useLocation } from "react-router-dom"
import { isLoggedIn } from "../lib_old/authstate"
import type { JSX } from "react"

export default function RequireAuth({ children }: { children: JSX.Element }) {
  const loc = useLocation()

  if (!isLoggedIn()) {
    const from = loc.pathname + (loc.search ?? "") + (loc.hash ?? "")
    return <Navigate to="/login" replace state={{ from }} />
  }

  return children
}
