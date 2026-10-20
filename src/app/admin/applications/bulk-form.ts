/**
 * The id that joins every row checkbox to the bulk-decide form.
 *
 * Its own file rather than exported from bulk-decide.tsx: anything exported
 * from a "use client" module reaches a Server Component as a client reference,
 * not its value, so the page would render form="[object]" on every checkbox.
 */
export const BULK_FORM_ID = "bulk-decide";
