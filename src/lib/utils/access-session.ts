import { toast } from "svelte-sonner";
import { asset } from "$app/paths";

/**
 * An installed app is resumed rather than reloaded, so Cloudflare Access never gets the chance to
 * redirect to its login page and remote calls just fail. When the app comes back to the foreground,
 * check the session: with `X-Requested-With`, Access answers an expired one with a 401 instead of a
 * redirect. Returns a cleanup function.
 */
export function watchAccessSession(): () => void {
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void checkSession();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => document.removeEventListener("visibilitychange", onVisibilityChange);
}

async function checkSession() {
  try {
    const response = await fetch(asset("manifest.json"), {
      method: "HEAD",
      cache: "no-store",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (response.status === 401) showExpired();
  } catch {
    // Offline: nothing to tell yet.
  }
}

function showExpired() {
  // A toast rather than an automatic reload, so text in the editor can be copied first.
  toast.warning("Your session has expired", {
    id: "access-session-expired",
    description: "Reload to sign in again. Unsaved text will be lost.",
    duration: Number.POSITIVE_INFINITY,
    action: { label: "Reload", onClick: () => location.reload() },
  });
}
