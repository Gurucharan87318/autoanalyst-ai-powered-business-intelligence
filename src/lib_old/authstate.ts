const KEY = "aa_auth"

export function isLoggedIn(): boolean {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

export function setLoggedIn(v: boolean) {
  try {
    if (v) localStorage.setItem(KEY, "1")
    else localStorage.removeItem(KEY)
  } catch {}
}
