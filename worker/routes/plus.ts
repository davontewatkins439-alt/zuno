import { Hono } from "hono";
import type { Env, SessionUser } from "../env";
import { now, readJson, safeEqual, str } from "../lib";
import { emit, notify } from "../perms";

type Ctx = { Bindings: Env; Variables: { user: SessionUser } };
export const plus = new Hono<Ctx>();

const enc = new TextEncoder();

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function configured(env: Env): boolean {
  return !!env.STRIPE_SECRET_KEY && !!env.STRIPE_PLUS_PRICE_ID;
}

async function stripe(env: Env, path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(init.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  return { ok: res.ok, status: res.status, data };
}

const OWNER_PLUS_DAYS = 365 * 100;

// PLUS ships with the owner account. This keeps the database row in step with
// the ownership flag so the badge, theme and decoration checks all agree.
export async function grantOwnerPlus(db: D1Database, userId: string): Promise<number> {
  const until = now() + OWNER_PLUS_DAYS * 24 * 60 * 60 * 1000;
  await db.prepare("UPDATE users SET plus_until = ? WHERE id = ?").bind(until, userId).run();
  await db
    .prepare(
      "INSERT OR IGNORE INTO user_badges (user_id, badge_slug, granted_by, granted_at) VALUES (?, 'plus', NULL, ?)",
    )
    .bind(userId, now())
    .run();
  await db
    .prepare(
      `INSERT INTO plus_subscriptions (user_id, provider, customer_ref, subscription_ref, status, source, current_period_end, updated_at)
       VALUES (?, 'complimentary', NULL, NULL, 'active', 'owner', ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET provider = 'complimentary', status = 'active', source = 'owner',
       subscription_ref = COALESCE(plus_subscriptions.subscription_ref, excluded.subscription_ref),
       current_period_end = excluded.current_period_end, updated_at = excluded.updated_at`,
    )
    .bind(userId, until, now())
    .run();
  return until;
}

async function activate(
  env: Env,
  userId: string,
  info: { provider: string; customer?: string | null; subscription?: string | null; periodEnd?: number | null; source: string },
) {
  const db = env.DB;
  const periodEnd = info.periodEnd ?? now() + 30 * 24 * 60 * 60 * 1000;
  await db
    .prepare(
      `INSERT INTO plus_subscriptions (user_id, provider, customer_ref, subscription_ref, status, source, current_period_end, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET provider = excluded.provider, customer_ref = excluded.customer_ref,
       subscription_ref = COALESCE(excluded.subscription_ref, plus_subscriptions.subscription_ref),
       status = 'active', source = excluded.source, current_period_end = excluded.current_period_end, updated_at = excluded.updated_at`,
    )
    .bind(userId, info.provider, info.customer ?? null, info.subscription ?? null, info.source, periodEnd, now())
    .run();
  await db.prepare("UPDATE users SET plus_until = ? WHERE id = ?").bind(periodEnd, userId).run();
  await db
    .prepare(
      "INSERT OR IGNORE INTO user_badges (user_id, badge_slug, granted_by, granted_at) VALUES (?, 'plus', NULL, ?)",
    )
    .bind(userId, now())
    .run();
  await notify(db, {
    userId,
    kind: "plus",
    title: "ZUNO PLUS is active",
    body: info.source === "stripe" ? "Your subscription is confirmed. Enjoy the extra customisation." : "A complimentary PLUS membership was applied to your account.",
  });
  await emit(db, "user", userId, "plus.update", { active: true, until: periodEnd });
}

plus.get("/status", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const row = await db.prepare("SELECT * FROM plus_subscriptions WHERE user_id = ?").bind(me.id).first<Record<string, unknown>>();
  const user = await db.prepare("SELECT plus_until, plus_theme, plus_decoration FROM users WHERE id = ?").bind(me.id).first<Record<string, unknown>>();
  const isOwner = me.is_owner === 1;
  return c.json({
    configured: configured(c.env),
    ownerOnly: false,
    purchasable: true,
    isOwner,
    priceLabel: "4.99",
    subscription: row
      ? {
          status: row.status,
          provider: row.provider,
          source: row.source,
          currentPeriodEnd: row.current_period_end,
          cancelAtPeriodEnd: row.status === "canceling",
        }
      : null,
    active: !!(isOwner || (user?.plus_until && Number(user.plus_until) > now())),
    until: user?.plus_until ?? null,
    theme: user?.plus_theme ?? null,
    decoration: user?.plus_decoration ?? null,
    benefits: [
      "Animated aurora and midnight profile themes",
      "Exclusive profile decorations and glow frames",
      "Original PLUS badge in chat and member lists",
      "Expanded profile accent customisation",
      "Priority access to new cosmetic features",
      "Extra server emoji slots for your communities",
    ],
  });
});

plus.post("/checkout", async (c) => {
  if (!configured(c.env)) {
    return c.json(
      {
        error: "ZUNO PLUS payments are not configured on this deployment yet.",
        code: "PAYMENTS_NOT_CONFIGURED",
        hint: "Set STRIPE_SECRET_KEY, STRIPE_PLUS_PRICE_ID and STRIPE_WEBHOOK_SECRET as server-side secrets, then deploy.",
      },
      501,
    );
  }
  const me = c.get("user");
  const originHeader = c.req.header("origin");
  const host = c.req.header("x-forwarded-host") || c.req.header("host");
  const origin = c.env.APP_ORIGIN || (originHeader && new URL(originHeader).host === host ? originHeader : `https://${host}`);
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("line_items[0][price]", String(c.env.STRIPE_PLUS_PRICE_ID));
  body.set("line_items[0][quantity]", "1");
  body.set("success_url", `${origin}/plus?plus=success`);
  body.set("cancel_url", `${origin}/plus?plus=cancelled`);
  body.set("client_reference_id", me.id);
  body.set("customer_email", me.email);
  body.set("allow_promotion_codes", "true");
  body.set("subscription_data[metadata][userId]", me.id);
  body.set("metadata[userId]", me.id);
  const res = await stripe(c.env, "/checkout/sessions", { method: "POST", body: body.toString() });
  if (!res.ok) {
    console.error("stripe checkout failed", res.status, res.data?.error?.message);
    return c.json({ error: "The payment provider rejected the checkout request.", code: "PAYMENT_PROVIDER_ERROR" }, 502);
  }
  return c.json({ url: res.data.url, sessionId: res.data.id });
});

plus.post("/cancel", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  if (!configured(c.env)) {
    return c.json({ error: "Payments are not configured on this deployment.", code: "PAYMENTS_NOT_CONFIGURED" }, 501);
  }
  const row = await db.prepare("SELECT * FROM plus_subscriptions WHERE user_id = ?").bind(me.id).first<Record<string, unknown>>();
  if (!row || row.provider !== "stripe" || !row.subscription_ref) {
    return c.json({ error: "No Stripe subscription is linked to this account." }, 400);
  }
  const res = await stripe(c.env, `/subscriptions/${row.subscription_ref}`, {
    method: "POST",
    body: "cancel_at_period_end=true",
  });
  if (!res.ok) return c.json({ error: "The payment provider could not cancel this subscription." }, 502);
  await db
    .prepare("UPDATE plus_subscriptions SET status = 'canceling', updated_at = ? WHERE user_id = ?")
    .bind(now(), me.id)
    .run();
  return c.json({ ok: true, cancelAt: res.data.current_period_end ?? null });
});

plus.post("/webhook", async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: "Webhook not configured" }, 501);
  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "Missing signature" }, 400);
  const payload = await c.req.text();
  const parts = signature.split(",").reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const timestamp = parseInt(parts.t || "0", 10);
  if (!timestamp || Math.abs(now() / 1000 - timestamp) > 300) return c.json({ error: "Stale signature" }, 400);
  const expected = await hmacHex(secret, `${timestamp}.${payload}`);
  if (!parts.v1 || !safeEqual(expected, parts.v1)) return c.json({ error: "Invalid signature" }, 400);

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return c.json({ error: "Invalid payload" }, 400);
  }
  const db = c.env.DB;
  const inserted = await db
    .prepare("INSERT INTO payment_events (id, type, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING")
    .bind(String(event.id || ""), String(event.type || ""), now())
    .run();
  if ((inserted.meta.changes ?? 0) === 0) return c.json({ received: true, duplicate: true });

  const object = event.data?.object ?? {};
  try {
    if (event.type === "checkout.session.completed") {
      const userId = object.client_reference_id || object.metadata?.userId;
      if (userId && object.payment_status === "paid") {
        let periodEnd: number | null = null;
        if (object.subscription && c.env.STRIPE_SECRET_KEY) {
          const sub = await stripe(c.env, `/subscriptions/${object.subscription}`);
          if (sub.ok && sub.data.current_period_end) periodEnd = sub.data.current_period_end * 1000;
        }
        await activate(c.env, userId, {
          provider: "stripe",
          customer: object.customer,
          subscription: object.subscription,
          periodEnd,
          source: "stripe",
        });
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const row = await db
        .prepare("SELECT user_id FROM plus_subscriptions WHERE subscription_ref = ?")
        .bind(object.id)
        .first<{ user_id: string }>();
      const userId = row?.user_id || object.metadata?.userId;
      if (userId) {
        const periodEnd = object.current_period_end ? object.current_period_end * 1000 : null;
        const status = String(object.status || "active");
        if (status === "active" || status === "trialing") {
          await activate(c.env, userId, {
            provider: "stripe",
            customer: object.customer,
            subscription: object.id,
            periodEnd,
            source: "stripe",
          });
        } else {
          await db
            .prepare("UPDATE plus_subscriptions SET status = ?, current_period_end = ?, updated_at = ? WHERE user_id = ?")
            .bind(status, periodEnd, now(), userId)
            .run();
          if (periodEnd) await db.prepare("UPDATE users SET plus_until = ? WHERE id = ?").bind(periodEnd, userId).run();
          await emit(db, "user", userId, "plus.update", { active: status === "active", status });
        }
      }
    } else if (event.type === "customer.subscription.deleted") {
      const row = await db
        .prepare("SELECT user_id FROM plus_subscriptions WHERE subscription_ref = ?")
        .bind(object.id)
        .first<{ user_id: string }>();
      if (row) {
        await db.prepare("UPDATE plus_subscriptions SET status = 'canceled', updated_at = ? WHERE user_id = ?").bind(now(), row.user_id).run();
        await db.prepare("UPDATE users SET plus_until = ? WHERE id = ?").bind(now(), row.user_id).run();
        await emit(db, "user", row.user_id, "plus.update", { active: false, status: "canceled" });
      }
    } else if (event.type === "invoice.payment_failed") {
      const customer = object.customer;
      const row = await db
        .prepare("SELECT user_id FROM plus_subscriptions WHERE customer_ref = ?")
        .bind(customer)
        .first<{ user_id: string }>();
      if (row) {
        await db.prepare("UPDATE plus_subscriptions SET status = 'past_due', updated_at = ? WHERE user_id = ?").bind(now(), row.user_id).run();
        await notify(db, {
          userId: row.user_id,
          kind: "plus",
          title: "ZUNO PLUS payment failed",
          body: "Update your payment method to keep your PLUS benefits. Nothing has been charged again automatically.",
        });
      }
    }
  } catch (err) {
    console.error("stripe webhook handling failed", err);
    return c.json({ error: "Webhook handler failed" }, 500);
  }
  return c.json({ received: true });
});

export { activate, configured, stripe };
