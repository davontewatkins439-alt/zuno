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

function canUse(plate: PlateRow, me: SessionUser, plusActive: boolean): boolean {
  if (me.is_owner === 1) return true;
  if (plate.unlock === "free") return true;
  if (plate.unlock === "plus") return plusActive;
  return false;
}

function retired(plate: PlateRow, at: number): boolean {
  return !!plate.available_until && plate.available_until <= at;
}

function unlockReason(plate: PlateRow, at: number): string {
  if (retired(plate, at)) return "This limited drop has ended.";
  if (plate.unlock === "plus") return "Included with ZUNO PLUS.";
  if (plate.unlock === "owner") return "Owner account only.";
  return "Free for everyone.";
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

  return c.json({
    plusActive,
    equipped: mine?.nameplate ?? null,
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
