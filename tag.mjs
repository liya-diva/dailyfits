// Holds your Anthropic key server-side so the browser never sees it.
// Without this, auto-tagging and outfit building cannot work on a hosted page.

export default async (req) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not set on this site." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
  const secret = process.env.CLOSET_KEY;
  if (secret && req.headers.get("x-closet-key") !== secret) {
    return new Response(JSON.stringify({ error: "Wrong passphrase." }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  const body = await req.text();
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body,
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `Upstream failed: ${e.message}` }), {
      status: 502, headers: { "content-type": "application/json" },
    });
  }
};

// Serves this function at /api/tag. With a custom path set, the default
// /.netlify/functions/ URL is intentionally not used.
export const config = { path: "/api/tag" };
