import { toast } from "svelte-sonner";

/** App-wide UI flags. */
export const ui = $state({
  /** Set after DeepL answers 456; the usage meter highlights itself. */
  quotaExceeded: false,
});

interface ErrorLike {
  status?: number;
  message?: string;
  body?: { message?: string; status?: number };
}

export function errorStatus(e: unknown): number | undefined {
  const err = e as ErrorLike | undefined;
  return err?.status ?? err?.body?.status;
}

/** A user-facing message for an error thrown by a remote function. */
export function errorMessage(e: unknown): string {
  const err = e as ErrorLike | undefined;
  return err?.body?.message ?? err?.message ?? "Something went wrong.";
}

/** Shows a toast for a failed remote call and updates shared flags. Returns the status. */
export function reportError(e: unknown, fallbackTitle?: string): number | undefined {
  const status = errorStatus(e);
  if (status === 456) ui.quotaExceeded = true;
  const message = errorMessage(e);
  if (fallbackTitle) toast.error(fallbackTitle, { description: message });
  else toast.error(message);
  return status;
}
