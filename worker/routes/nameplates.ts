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
}

function canUse(plate: PlateRow, me: SessionUser, plusActive: boolean): boolean {
  if (me.is_owner === 1) return true;
  if (plate.unlock === "free") return true;
  if (plate.unlock === "plus") return plusActive;
  return false;
}

function unlockReason(plate: PlateRow): string {
  if (plate.unlock === "plus") return "Included with ZUNO PLUS.";
  if (plate.unlock === "owner") return "Owner account only.";
  return "Free for everyone.";
}

nameplates.get("/nameplates", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const plusActive = me.is_owner === 1 || !!(me.plus_until && me.plus_until > now());
  const rows = await db.prepare("SELECT * FROM nameplates WHERE active = 1 ORDER BY sort DESC, name ASC").all<PlateRow>();
  const owned = await db
    .prepare("SELECT nameplate_id FROM user_nameplates WHERE user_id = ?")
    .bind(me.id)
    .all<{ nameplate_id: string }>();
  const ownedIds = new Set(owned.results.map((row) => row.nameplate_id));
  const popular = await db
    .prepare("SELECT nameplate FROM users WHERE nameplate IS NOT NULL GROUP BY nameplate")
    .all<{ nameplate: string }>();
  const equippedCounts = new Map<string, number>();
  for (const row of popular.results) equippedCounts.set(row.nameplate, (equippedCounts.get(row.nameplate) ?? 0) + 1);
  const equipped = await db.prepare("SELECT nameplate FROM users WHERE id = ?").bind(me.id).first<{ nameplate: string | null }>();

  return c.json({
    plusActive,
    equipped: equipped?.nameplate ?? null,
    nameplates: rows.results.map((plate) => {
      const allowed = canUse(plate, me, plusActive);
      return {
        id: plate.id,
        name: plate.name,
        description: plate.description,
        rarity: plate.rarity,
        animation: plate.animation,
        unlock: plate.unlock,
        unlockHint: unlockReason(plate),
        unlocked: allowed || ownedIds.has(plate.id),
        equipped: equipped?.nameplate === plate.id,
        equippedBy: equippedCounts.get(plate.id) ?? 0,
      };
    }),
  });
});

nameplates.post("/nameplates/:id/unlock", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const plate = await db.prepare("SELECT * FROM nameplates WHERE id = ? AND active = 1").bind(c.req.param("id")).first<PlateRow>();
  if (!plate) return bad(c, "That nameplate does not exist.", 404);
  const plusActive = me.is_owner === 1 || !!(me.plus_until && me.plus_until > now());
  if (!canUse(plate, me, plusActive)) {
    return bad(c, plate.unlock === "plus" ? "This nameplate is part of ZUNO PLUS." : "This nameplate is owner-only.", 403);
  }
  await db
    .prepare("INSERT OR IGNORE INTO user_nameplates (user_id, nameplate_id, granted_by, granted_at) VALUES (?, ?, NULL, ?)")
    .bind(me.id, plate.id, now())
    .run();
  return c.json({ ok: true, unlocked: true });
});

nameplates.post("/nameplates/:id/equip", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const id = c.req.param("id");
  const plate = await db.prepare("SELECT * FROM nameplates WHERE id = ? AND active = 1").bind(id).first<PlateRow>();
  if (!plate) return bad(c, "That nameplate does not exist.", 404);
  const plusActive = me.is_owner === 1 || !!(me.plus_until && me.plus_until > now());
  const owned = await db
    .prepare("SELECT 1 as ok FROM user_nameplates WHERE user_id = ? AND nameplate_id = ?")
    .bind(me.id, id)
    .first<{ ok: number }>();
  if (!owned && !canUse(plate, me, plusActive)) return bad(c, "Unlock this nameplate first.", 403);

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
