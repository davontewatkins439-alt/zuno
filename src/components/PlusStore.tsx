import React, { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, Check, Gem, Palette, ShieldCheck, Sparkles } from "lucide-react";
import { useApp } from "../state";
import { api } from "../lib/api";
import { PLUS_DECORATIONS, PLUS_THEMES } from "../lib/utils";
import { Avatar, ZunoMark } from "./ui";

const BENEFITS = [
  {
    icon: Palette,
    title: "Animated profile themes",
    copy: "Aurora, Midnight, Ember and Neon gradients across your profile card and banner.",
  },
  {
    icon: Gem,
    title: "Exclusive decorations",
    copy: "Holo, pulse and grid frames that follow your avatar into every conversation.",
  },
  {
    icon: BadgeCheck,
    title: "Original PLUS badge",
    copy: "A prism badge on your profile, messages and the member list, so people know.",
  },
  {
    icon: Sparkles,
    title: "Expanded customisation",
    copy: "Full accent control, priority access to new cosmetics, and extra emoji slots for communities you run.",
  },
  {
    icon: ShieldCheck,
    title: "Keep ZUNO independent",
    copy: "Every membership directly funds the servers, voice rooms and features everyone uses.",
  },
];

export function PlusStore() {
  const app = useApp();
  const { plus } = app.me;
  const active = app.me.user.plusActive;
  const isOwner = app.me.user.isOwner;
  const until = app.me.user.plusUntil;
  const comp = plus.subscription?.source === "complimentary" || plus.subscription?.source === "owner";
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void app.refreshMe(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribe = async () => {
    setBusy(true);
    try {
      const data = await api<{ url: string }>("/api/plus/checkout", { method: "POST", body: {} });
      window.location.href = data.url;
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Checkout is unavailable right now", "error");
      setBusy(false);
    }
  };

  return (
    <section className="plus-store">
      <header className="plus-store-hero">
        <span className="plus-store-glow" />
        <div className="plus-store-copy">
          <span className="eyebrow">
            <Sparkles size={15} /> ZUNO PLUS
          </span>
          <h1>
            Glow a little <span>brighter.</span>
          </h1>
          <p>
            Premium identity for people who make ZUNO theirs. Animated themes, exclusive decorations and a badge that follows you
            everywhere — while keeping the city independent.
          </p>
          <div className="plus-store-price">
            <strong>{plus.priceLabel}</strong>
            {active ? (
              <span className="plus-active-pill">
                <Check size={13} /> Active
                {isOwner ? " · included with your owner account" : comp ? " · complimentary" : ""}
                {!isOwner && !comp && until ? ` · renews ${new Date(until).toLocaleDateString()}` : ""}
              </span>
            ) : (
              <span className="plus-inactive-pill">Not subscribed</span>
            )}
          </div>
          <div className="plus-store-actions">
            {active ? (
              <button
                type="button"
                className="primary-btn"
                onClick={() => app.openModal({ type: "userSettings", tab: "plus" })}
              >
                <Sparkles size={15} /> Manage membership <ArrowRight size={15} />
              </button>
            ) : (
              <button type="button" className="primary-btn" onClick={() => void subscribe()} disabled={busy}>
                {busy ? "Opening checkout…" : "Get ZUNO PLUS"} <ArrowRight size={15} />
              </button>
            )}
            <button
              type="button"
              className="ghost-btn"
              onClick={() => app.openModal({ type: "userSettings", tab: "plus" })}
            >
              Try the themes
            </button>
          </div>
          {!plus.configured && (
            <p className="plus-config-note">
              Payments are not configured on this deployment yet. An owner must add the Stripe secret key, price ID and webhook
              signing secret before subscriptions can be purchased. No one is marked as paid without a verified webhook.
            </p>
          )}
          {isOwner && active && (
            <p className="form-hint">Yours free as the ZUNO owner — no payment method is connected and nothing renews.</p>
          )}
          {active && comp && !isOwner && (
            <p className="form-hint">Complimentary membership granted by ZUNO — no payment is connected to this account.</p>
          )}
          <p className="plus-store-fineprint">Secure checkout by Stripe · cancel anytime · no ads, ever.</p>
        </div>

        <div className="plus-store-art" aria-hidden="true">
          <div className="plus-art-card">
            <div className="plus-art-banner" />
            <div className="plus-art-avatar">
              <Avatar user={app.me.user} size={58} decoration={active ? "pulse" : undefined} />
            </div>
            <div className="plus-art-body">
              <strong>{app.me.user.displayName || app.me.user.username}</strong>
              <span>{active ? "PLUS member · Aurora theme" : "Preview · PLUS member"}</span>
              <span className="plus-art-badge">
                <Sparkles size={11} /> ZUNO PLUS
              </span>
            </div>
          </div>
          <div className="plus-art-note">
            <ZunoMark size={16} /> Your profile, upgraded.
          </div>
        </div>
      </header>

      <h2 className="plus-store-heading">What you unlock</h2>
      <div className="plus-benefit-grid">
        {BENEFITS.map((benefit) => (
          <article key={benefit.title} className="plus-benefit-card">
            <span className="plus-benefit-icon">
              <benefit.icon size={18} />
            </span>
            <strong>{benefit.title}</strong>
            <p>{benefit.copy}</p>
          </article>
        ))}
      </div>

      <h2 className="plus-store-heading">Profile themes</h2>
      <div className="plus-store-themes">
        {PLUS_THEMES.map((theme) => (
          <div
            key={theme.key}
            className="plus-store-theme"
            style={{ background: `linear-gradient(135deg, ${theme.colors[0]}33, ${theme.colors[1]}22)` }}
          >
            <span className="theme-dots">
              {theme.colors.map((color) => (
                <i key={color} style={{ background: color }} />
              ))}
            </span>
            <strong>{theme.label}</strong>
            <span>Profile + banner</span>
          </div>
        ))}
      </div>

      <h2 className="plus-store-heading">Profile decorations</h2>
      <div className="plus-store-decorations">
        {PLUS_DECORATIONS.map((decoration) => (
          <span key={decoration.key} className="plus-store-decoration">
            <Sparkles size={13} /> {decoration.label}
          </span>
        ))}
      </div>

      {!active ? (
        <div className="plus-store-cta">
          <div>
            <strong>Ready when you are.</strong>
            <span>One membership, every cosmetic. Cancel whenever you like.</span>
          </div>
          <button type="button" className="primary-btn" onClick={() => void subscribe()} disabled={busy}>
            {busy ? "Opening checkout…" : `Get PLUS · ${plus.priceLabel}`} <ArrowRight size={15} />
          </button>
        </div>
      ) : (
        <div className="plus-store-cta">
          <div>
            <strong>Your cosmetics are ready.</strong>
            <span>
              {isOwner ? "Yours free with the owner account." : "Change your theme and decoration whenever you like."}
            </span>
          </div>
          <button
            type="button"
            className="primary-btn"
            onClick={() => app.openModal({ type: "userSettings", tab: "plus" })}
          >
            Open cosmetics <ArrowRight size={15} />
          </button>
        </div>
      )}
    </section>
  );
}
