import type { Handle, HandleServerError } from "@sveltejs/kit/hooks";
import { createInitialModeExpression } from "mode-watcher";
import { THEME_COLORS } from "#lib/config.js";

const modeScript = createInitialModeExpression({ themeColors: THEME_COLORS });

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event, {
    // mode-watcher's initial-mode script lives in app.html so it gets the CSP nonce.
    transformPageChunk: ({ html }) => html.replace("%modewatcher.script%", modeScript),
  });

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
};

export const handleError: HandleServerError = (caught) => {
  const { event } = caught;
  const where = `${event.request.method} ${event.url.pathname}`;

  switch (caught.kind) {
    case "unknown":
      // Logged for Workers observability; never sent to the browser.
      console.error(`Unhandled error in ${where}:`, caught.error);
      return { message: "Something went wrong." };
    case "validation":
      // Schema messages are ours, so they're safe to show.
      return { message: caught.issues[0]?.message ?? "Invalid input" };
    default:
      if (caught.error.status >= 500) console.error(`${caught.error.status} in ${where}: ${caught.error.message}`);
  }
};
