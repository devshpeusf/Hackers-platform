// React's built-in typings drop `bgcolor` from <td> (it's kept on <table>,
// inconsistently) even though it's still valid HTML and, for email
// specifically, a more reliably-honored background than CSS alone — see
// the comment in ConfirmationEmail.tsx on why both are set. This restores
// just enough typing for that one attribute rather than reaching for `any`
// at every call site.
import "react";

declare module "react" {
  interface TdHTMLAttributes<T> extends HTMLAttributes<T> {
    bgcolor?: string;
  }
}
