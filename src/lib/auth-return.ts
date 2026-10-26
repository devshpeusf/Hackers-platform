/** Known post-OAuth destinations only. Never decode or normalize untrusted paths. */
export function authReturnPath(value: unknown): "/apply/form" | "/scanner" {
  return value === "/scanner" ? "/scanner" : "/apply/form";
}
