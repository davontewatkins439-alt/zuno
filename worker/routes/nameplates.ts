import { Hono } from "hono";
import type { Env, SessionUser } from "../env";
import { bad, now } from "../lib";
import { emit } from "../perms";

type Ctx = { Bindings: Env; Variables: { user: SessionUser } };
export const nameplates = new Hono<Ctx>();

interface PlateRow {
  id: string;
  name: string;
  description: string | null;
  rarity: string;
  unlock: string;
  animation: string | null;
  active: number;
  sort: number;
  released_at: number | null;
  available_until: number | null;
}

const NEW_FOR_MS = 14 * 86_400_000;

function canUse(entry: { unlock: string }, me: SessionUser, plusActive: boolean): boolean {
  if (me.is_owner === 1) return true;
  if (entry.unlock === "free") return true;
  if (entry.unlock === "plus") return plusActive;
  return false;
}

function retired(entry: { available_until: number | null }, at: number): boolean {
  return !!entry.available_until && entry.available_until <= at;
}

function unlockReason(entry: { unlock: string; available_until: number | null }, at: number): string {
  if (retired(entry, at)) return "This limited drop has ended.";
  if (entry.unlock === "plus") return "Included with ZUNO PLUS.";
  if (entry.unlock === "owner") return "Owner account only.";
  return "Free for everyone.";
}

interface BundleRow {
  id: string;
  name: string;
  description: string | null;
  rarity: string;
  unlock: string;
  price_cents: number;
  compare_cents: number;
  active: number;
  sort: number;
  released_at: number | null;
  available_until: number | null;
}

function shape(plate: PlateRow, at: number) {
  return {
    id: plate.id,
    name: plate.name,
    description: plate.description,
    rarity: plate.rarity,
    animation: plate.animation,
    unlock: plate.unlock,
    unlockHint: unlockReason(plate, at),
    limited: !!plate.available_until,
    endsAt: plate.available_until,
    releasedAt: plate.released_at ?? 0,
    isNew: !!plate.released_at && at - plate.released_at < NEW_FOR_MS,
  };
}

nameplates.get("/nameplates", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const at = now();
  const plusActive = me.is_owner === 1 || !!(me.plus_until && me.plus_until > at);
  const rows = await db
    .prepare("SELECT * FROM nameplates WHERE active = 1 ORDER BY sort DESC, name ASC")
    .all<PlateRow>();
  const owned = await db
    .prepare("SELECT nameplate_id FROM user_nameplates WHERE user_id = ?")
    .bind(me.id)
    .all<{ nameplate_id: string }>();
  const ownedIds = new Set(owned.results.map((row) => row.nameplate_id));
  const favorites = await db
    .prepare("SELECT nameplate_id FROM nameplate_favorites WHERE user_id = ?")
    .bind(me.id)
    .all<{ nameplate_id: string }>();
  const favoriteIds = new Set(favorites.results.map((row) => row.nameplate_id));
  const equippedRows = await db
    .prepare("SELECT nameplate, COUNT(*) as n FROM users WHERE nameplate IS NOT NULL GROUP BY nameplate")
    .all<{ nameplate: string; n: number }>();
  const equippedCounts = new Map<string, number>();
  for (const row of equippedRows.results) equippedCounts.set(row.nameplate, row.n);
  const mine = await db
    .prepare("SELECT nameplate FROM users WHERE id = ?")
    .bind(me.id)
    .first<{ nameplate: string | null }>();

  // Bundles are the shopfront: a themed pack of plates. Each card reports how
  // many of its pieces this account already owns so the button can say
  // "Claim all" instead of pretending there is something to buy.
  const bundleRows = await db
    .prepare("SELECT * FROM nameplate_bundles WHERE active = 1 ORDER BY sort DESC, name ASC")
    .all<BundleRow>();
  const itemRows = await db
    .prepare(
      `SELECT bi.bundle_id, bi.position, p.* FROM nameplate_bundle_items bi
       JOIN nameplates p ON p.id = bi.nameplate_id
       WHERE p.active = 1 ORDER BY bi.position ASC`,
    )
    .all<PlateRow & { bundle_id: string; position: number }>();
  const bundleFavorites = await db
    .prepare("SELECT bundle_id FROM nameplate_bundle_favorites WHERE user_id = ?")
    .bind(me.id)
    .all<{ bundle_id: string }>();
  const favoriteBundles = new Set(bundleFavorites.results.map((row) => row.bundle_id));

  const piecesByBundle = new Map<string, (PlateRow & { position: number })[]>();
  for (const item of itemRows.results) {
    const list = piecesByBundle.get(item.bundle_id) ?? [];
    list.push(item);
    piecesByBundle.set(item.bundle_id, list);
  }

  return c.json({
    plusActive,
    equipped: mine?.nameplate ?? null,
    bundles: bundleRows.results.map((bundle) => {
      const pieces = piecesByBundle.get(bundle.id) ?? [];
      const entitled = canUse(bundle, me, plusActive);
      const retiredAt = retired(bundle, at);
      const ownedCount = pieces.filter((piece) => ownedIds.has(piece.id)).length;
      const discount =
        bundle.compare_cents > bundle.price_cents && bundle.compare_cents > 0
          ? Math.round((1 - bundle.price_cents / bundle.compare_cents) * 100)
          : 0;
      return {
        id: bundle.id,
        name: bundle.name,
        description: bundle.description,
        rarity: bundle.rarity,
        unlock: bundle.unlock,
        unlockHint: unlockReason(bundle, at),
        priceCents: bundle.price_cents,
        compareCents: bundle.compare_cents,
        discount,
        limited: !!bundle.available_until,
        endsAt: bundle.available_until,
        releasedAt: bundle.released_at ?? 0,
        isNew: !!bundle.released_at && at - bundle.released_at < NEW_FOR_MS,
        favorite: favoriteBundles.has(bundle.id),
        claimable: entitled && !retiredAt && ownedCount < pieces.length,
        claimed: pieces.length > 0 && ownedCount === pieces.length,
        ownedCount,
        total: pieces.length,
        pieces: pieces.map((piece) => ({
          id: piece.id,
          name: piece.name,
          rarity: piece.rarity,
          unlock: piece.unlock,
          owned: ownedIds.has(piece.id),
          equippable: ownedIds.has(piece.id) || (canUse(piece, me, plusActive) && !retired(piece, at)),
          equipped: mine?.nameplate === piece.id,
          wornBy: equippedCounts.get(piece.id) ?? 0,
        })),
      };
    }),
    nameplates: rows.results.map((plate) => {
      const owned = ownedIds.has(plate.id);
      const allowed = canUse(plate, me, plusActive) && !retired(plate, at);
      return {
        ...shape(plate, at),
        unlocked: allowed || owned,
        equippable: owned || canUse(plate, me, plusActive),
        equipped: mine?.nameplate === plate.id,
        equippedBy: equippedCounts.get(plate.id) ?? 0,
        favorite: favoriteIds.has(plate.id),
      };
    }),
  });
});

nameplates.post("/nameplates/:id/unlock", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const at = now();
  const plate = await db
    .prepare("SELECT * FROM nameplates WHERE id = ? AND active = 1")
    .bind(c.req.param("id"))
    .first<PlateRow>();
  if (!plate) return bad(c, "That nameplate does not exist.", 404);
  const plusActive = me.is_owner === 1 || !!(me.plus_until && me.plus_until > at);
  if (retired(plate, at) && me.is_owner !== 1) {
    return bad(c, "This limited drop has ended.", 403);
  }
  if (!canUse(plate, me, plusActive)) {
    return bad(c, plate.unlock === "plus" ? "This nameplate is part of ZUNO PLUS." : "This nameplate is owner-only.", 403);
  }
  await db
    .prepare("INSERT OR IGNORE INTO user_nameplates (user_id, nameplate_id, granted_by, granted_at) VALUES (?, ?, NULL, ?)")
    .bind(me.id, plate.id, at)
    .run();
  return c.json({ ok: true, unlocked: true });
});

nameplates.post("/nameplates/:id/equip", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const at = now();
  const id = c.req.param("id");
  const plate = await db.prepare("SELECT * FROM nameplates WHERE id = ? AND active = 1").bind(id).first<PlateRow>();
  if (!plate) return bad(c, "That nameplate does not exist.", 404);
  const plusActive = me.is_owner === 1 || !!(me.plus_until && me.plus_until > at);
  const owned = await db
    .prepare("SELECT 1 as ok FROM user_nameplates WHERE user_id = ? AND nameplate_id = ?")
    .bind(me.id, id)
    .first<{ ok: number }>();
  if (!owned) {
    if (retired(plate, at) && me.is_owner !== 1) return bad(c, "This limited drop has ended.", 403);
    if (!canUse(plate, me, plusActive)) return bad(c, "Unlock this nameplate first.", 403);
  }

  await db.prepare("UPDATE users SET nameplate = ? WHERE id = ?").bind(id, me.id).run();
  await emit(db, "user", me.id, "user.nameplate", { nameplate: id });
  return c.json({ ok: true, equipped: id });
});

nameplates.delete("/nameplates/equip", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  await db.prepare("UPDATE users SET nameplate = NULL WHERE id = ?").bind(me.id).run();
  await emit(db, "user", me.id, "user.nameplate", { nameplate: null });
  return c.json({ ok: true, equipped: null });
});

/* ------------------------------- favorites ------------------------------- */

async function plateExists(db: D1Database, id: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 as ok FROM nameplates WHERE id = ? AND active = 1").bind(id).first<{ ok: number }>();
  return !!row;
}

nameplates.post("/nameplates/:id/favorite", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const id = c.req.param("id");
  if (!(await plateExists(db, id))) return bad(c, "That nameplate does not exist.", 404);
  const existing = await db
    .prepare("SELECT 1 as ok FROM nameplate_favorites WHERE user_id = ? AND nameplate_id = ?")
    .bind(me.id, id)
    .first<{ ok: number }>();
  if (existing) {
    await db.prepare("DELETE FROM nameplate_favorites WHERE user_id = ? AND nameplate_id = ?").bind(me.id, id).run();
    return c.json({ ok: true, favorite: false });
  }
  await db
    .prepare("INSERT OR IGNORE INTO nameplate_favorites (user_id, nameplate_id, created_at) VALUES (?, ?, ?)")
    .bind(me.id, id, now())
    .run();
  return c.json({ ok: true, favorite: true });
});

/* -------------------------------- bundles -------------------------------- */

async function loadBundle(db: D1Database, id: string) {
  const bundle = await db
    .prepare("SELECT * FROM nameplate_bundles WHERE id = ? AND active = 1")
    .bind(id)
    .first<BundleRow>();
  if (!bundle) return null;
  const items = await db
    .prepare(
      `SELECT p.* FROM nameplate_bundle_items bi
       JOIN nameplates p ON p.id = bi.nameplate_id
       WHERE bi.bundle_id = ? AND p.active = 1 ORDER BY bi.position ASC`,
    )
    .bind(id)
    .all<PlateRow>();
  return { bundle, plates: items.results };
}

/**
 * Adding a bundle to your collection copies every plate in it into
 * user_nameplates. Eligibility is decided here from the account's own rows —
 * never from anything the browser sends — and the grant is idempotent.
 */
nameplates.post("/bundles/:id/claim", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const at = now();
  const loaded = await loadBundle(db, c.req.param("id"));
  if (!loaded) return bad(c, "That bundle does not exist.", 404);
  const { bundle, plates } = loaded;
  const plusActive = me.is_owner === 1 || !!(me.plus_until && me.plus_until > at);
  if (retired(bundle, at) && me.is_owner !== 1) return bad(c, "That bundle is no longer available.", 403);
  if (!canUse(bundle, me, plusActive)) {
    return bad(c, bundle.unlock === "plus" ? "That bundle is part of ZUNO PLUS." : "That bundle is owner-only.", 403);
  }
  let added = 0;
  for (const plate of plates) {
    if (!canUse(plate, me, plusActive)) continue;
    if (retired(plate, at) && me.is_owner !== 1) continue;
    const res = await db
      .prepare("INSERT OR IGNORE INTO user_nameplates (user_id, nameplate_id, granted_by, granted_at) VALUES (?, ?, NULL, ?)")
      .bind(me.id, plate.id, at)
      .run();
    if ((res.meta.changes ?? 0) > 0) added += 1;
  }
  return c.json({ ok: true, added, total: plates.length });
});

nameplates.post("/bundles/:id/favorite", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const id = c.req.param("id");
  const exists = await db
    .prepare("SELECT 1 as ok FROM nameplate_bundles WHERE id = ? AND active = 1")
    .bind(id)
    .first<{ ok: number }>();
  if (!exists) return bad(c, "That bundle does not exist.", 404);
  const existing = await db
    .prepare("SELECT 1 as ok FROM nameplate_bundle_favorites WHERE user_id = ? AND bundle_id = ?")
    .bind(me.id, id)
    .first<{ ok: number }>();
  if (existing) {
    await db
      .prepare("DELETE FROM nameplate_bundle_favorites WHERE user_id = ? AND bundle_id = ?")
      .bind(me.id, id)
      .run();
    return c.json({ ok: true, favorite: false });
  }
  await db
    .prepare("INSERT OR IGNORE INTO nameplate_bundle_favorites (user_id, bundle_id, created_at) VALUES (?, ?, ?)")
    .bind(me.id, id, now())
    .run();
  return c.json({ ok: true, favorite: true });
});
