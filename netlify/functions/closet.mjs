const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// Client keys look like "closet:img:ab12cd". A "/" hierarchy keeps the
// Netlify Blobs UI browsable.
const blobKey = (k) => String(k || "").replace(/^closet:/, "").replace(/:/g, "/");

// Loaded lazily and guarded: if the module or the store is unavailable, we want a
// readable message in the browser, not an opaque 502 from a crashed function.
async function openStore() {
  let getStore;
  try {
    ({ getStore } = await import("@netlify/blobs"));
  } catch (e) {
    throw new Error(
      "The @netlify/blobs package is not installed. Confirm package.json is committed " +
      "to the repo, then Deploys > Trigger deploy > Clear cache and deploy site."
    );
  }
  try {
    return getStore({ name: "closet", consistency: "strong" });
  } catch (e) {
    throw new Error(
      "Netlify Blobs is not available to this site. This usually means the site was " +
      "deployed without being linked to a Netlify project. Original error: " + e.message
    );
  }
}

export default async (req) => {
  try {
    const secret = process.env.CLOSET_KEY;
    if (secret && req.headers.get("x-closet-key") !== secret) {
      return json({ error: "Wrong passphrase." }, 401);
    }

    const store = await openStore();

    // Paged bulk read: metadata plus a slice of photos, so opening the site is a
    // handful of requests rather than one per garment.
    if (req.method === "GET") {
      const url = new URL(req.url);
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
      const limit = Math.min(24, Math.max(1, Number(url.searchParams.get("limit") || 18)));
      // These must match what the client writes. The client's keys are
      // "closet:meta:v2" and "closet:outfits:v2", which blobKey() maps to
      // "meta/v2" and "outfits/v2" — reading plain "meta" here silently
      // returned an empty closet on every reload.
      const meta = (await store.get("meta/v2", { type: "json" })) || [];
      const outfits = offset === 0 ? (await store.get("outfits/v2", { type: "json" })) || [] : [];
      const slice = meta.slice(offset, offset + limit);
      const images = {};
      await Promise.all(
        slice.map(async (g) => {
          try { images[g.id] = await store.get(`img/${g.id}`); }
          catch { images[g.id] = null; }
        })
      );
      return json({
        meta: offset === 0 ? meta : [],
        slice: slice.map((g) => g.id),
        images,
        outfits,
        total: meta.length,
      });
    }

    if (req.method === "POST") {
      let body;
      try { body = await req.json(); }
      catch { return json({ error: "Bad request body." }, 400); }
      const { op, key, value } = body || {};
      if (!op) return json({ error: "Missing op." }, 400);

      if (op === "get") {
        const v = await store.get(blobKey(key));
        return json({ value: v });
      }
      if (op === "set") {
        if (typeof value !== "string") return json({ error: "Value must be a string." }, 400);
        await store.set(blobKey(key), value);
        return json({ ok: true });
      }
      if (op === "del") {
        await store.delete(blobKey(key));
        return json({ ok: true });
      }
      return json({ error: `Unknown op: ${op}` }, 400);
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (e) {
    // Anything unexpected still comes back as readable JSON.
    return json({ error: e.message || "Unknown server error." }, 500);
  }
};

// Serves this function at /api/closet. With a custom path set, the default
// /.netlify/functions/ URL is intentionally not used.
export const config = { path: "/api/closet" };
