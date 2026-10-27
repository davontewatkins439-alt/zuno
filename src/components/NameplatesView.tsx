import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Crown,
  Heart,
  Loader2,
  Lock,
  Palette,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { useApp } from "../state";
import { api, ApiError } from "../lib/api";
import type { Nameplate } from "../lib/types";
import { cls } from "../lib/utils";
import { plateClass } from "../lib/nameplates";
import { Avatar, Verified } from "./ui";
import { PlateArt } from "./PlateArt";

interface Payload {
  plusActive: boolean;
  equipped: string | null;
  nameplates: Nameplate[];
}

const TIERS = [
  { id: "all", label: "All plates" },
  { id: "free", label: "Free" },
  { id: "plus", label: "ZUNO PLUS" },
  { id: "owner", label: "Owner" },
  { id: "favorites", label: "Favourites" },
] as const;

const RARITIES = [
  { id: "any", label: "Any rarity" },
  { id: "standard", label: "Standard" },
  { id: "premium", label: "Premium" },
  { id: "legendary", label: "Legendary" },
] as const;

type SortId = "popular" | "newest" | "rarity" | "az";

const RARITY_RANK: Record<string, number> = { legendary: 3, premium: 2, standard: 1 };

function daysLeft(endsAt: number | null): number | null {
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 86_400_000));
}

export function NameplatesView() {
  const app = useApp();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<string>("all");
  const [rarity, setRarity] = useState<string>("any");
  const [limitedOnly, setLimitedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<SortId>("popular");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api<Payload>("/api/nameplates"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The nameplate catalogue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const equip = async (plate: Nameplate) => {
    setBusy(plate.id);
    try {
      if (!plate.unlocked) await api(`/api/nameplates/${plate.id}/unlock`, { method: "POST" });
      await api(`/api/nameplates/${plate.id}/equip`, { method: "POST" });
      await Promise.all([load(), app.refreshMe(true)]);
      app.toast(`${plate.name} equipped`, "success");
    } catch (err) {
      app.toast(err instanceof ApiError ? err.message : "That nameplate could not be equipped.", "error");
    } finally {
      setBusy(null);
    }
  };

  const unfavorite = async (plate: Nameplate) => {
    setBusy(`fav-${plate.id}`);
    try {
      const res = await api<{ favorite: boolean }>(`/api/nameplates/${plate.id}/favorite`, { method: "POST" });
      setData((prev) =>
        prev
          ? {
              ...prev,
              nameplates: prev.nameplates.map((entry) =>
                entry.id === plate.id ? { ...entry, favorite: res.favorite } : entry,
              ),
            }
          : prev,
      );
      app.toast(res.favorite ? `${plate.name} saved` : `${plate.name} removed from favourites`, "info");
    } catch (err) {
      app.toast(err instanceof ApiError ? err.message : "Could not update favourites.", "error");
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    setBusy("clear");
    try {
      await api("/api/nameplates/equip", { method: "DELETE" });
      await Promise.all([load(), app.refreshMe(true)]);
      app.toast("Nameplate removed", "info");
    } catch (err) {
      app.toast(err instanceof ApiError ? err.message : "Could not remove the nameplate.", "error");
    } finally {
      setBusy(null);
    }
  };

  const plates = data?.nameplates ?? [];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = plates.filter((plate) => {
      if (tier === "favorites" && !plate.favorite) return false;
      if (tier !== "all" && tier !== "favorites" && plate.unlock !== tier) return false;
      if (rarity !== "any" && plate.rarity !== rarity) return false;
      if (limitedOnly && !plate.limited) return false;
      if (!q) return true;
      return plate.name.toLowerCase().includes(q) || (plate.description ?? "").toLowerCase().includes(q);
    });
    return list.sort((a, b) => {
      if (sort === "newest") return b.releasedAt - a.releasedAt || b.id.localeCompare(a.id);
      if (sort === "rarity") return (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0) || a.name.localeCompare(b.name);
      if (sort === "az") return a.name.localeCompare(b.name);
      return b.equippedBy - a.equippedBy || a.name.localeCompare(b.name);
    });
  }, [plates, tier, rarity, limitedOnly, query, sort]);

  const equipped = plates.find((plate) => plate.equipped) ?? null;
  const favorites = plates.filter((plate) => plate.favorite).length;
  const verified = app.me.user.isOwner || app.me.user.badges.some((badge) => badge.slug === "verified");

  return (
    <section className="plates-view">
      <header className="plates-head">
        <div>
          <span className="eyebrow">
            <Palette size={14} /> ZUNO NAME COSMETICS
          </span>
          <h1>
            Nameplates <span className="plates-total">({plates.length})</span>
          </h1>
          <p>Paint the banner behind your display name. Your plate follows you into every server, DM and profile.</p>
        </div>
        <div className="plates-head-tools">
          <label className="plates-sortby">
            <span>Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortId)}>
              <option value="popular">Popular</option>
              <option value="newest">Newest</option>
              <option value="rarity">Rarity</option>
              <option value="az">A–Z</option>
            </select>
          </label>
          <button
            type="button"
            className={cls("ghost-btn", "plates-filter-toggle", showFilters && "active")}
            onClick={() => setShowFilters((prev) => !prev)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal size={14} /> {showFilters ? "Hide filters" : "Show filters"}
          </button>
        </div>
      </header>

      {equipped ? (
        <article className="plates-current">
          <span className={cls("plates-current-name", "plate-name", plateClass(equipped.id))}>
            <PlateArt id={equipped.id} />
            <span className="plate-label">{app.me.user.displayName}</span>
          </span>
          <div>
            <strong>{equipped.name}</strong>
            <span>Equipped right now</span>
          </div>
          <button type="button" className="ghost-btn small" onClick={() => void clear()} disabled={busy !== null}>
            {busy === "clear" ? <Loader2 size={13} className="spin" /> : <X size={13} />} Remove
          </button>
        </article>
      ) : null}

      {showFilters ? (
        <div className="plates-filter-panel">
          <label className="plates-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search nameplates"
              aria-label="Search nameplates"
            />
          </label>
          <div className="plates-filter-group">
            <span className="plates-filter-label">Access</span>
            <div className="plates-filters" role="tablist" aria-label="Nameplate access">
              {TIERS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={tier === entry.id}
                  className={cls(tier === entry.id && "active")}
                  onClick={() => setTier(entry.id)}
                >
                  {entry.id === "favorites" && <Heart size={12} />} {entry.label}
                  {entry.id === "favorites" && favorites > 0 ? <em>{favorites}</em> : null}
                </button>
              ))}
            </div>
          </div>
          <div className="plates-filter-group">
            <span className="plates-filter-label">Rarity</span>
            <div className="plates-filters" role="tablist" aria-label="Nameplate rarity">
              {RARITIES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={rarity === entry.id}
                  className={cls(rarity === entry.id && "active")}
                  onClick={() => setRarity(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className={cls("plates-toggle-pill", limitedOnly && "active")}
            onClick={() => setLimitedOnly((prev) => !prev)}
            aria-pressed={limitedOnly}
          >
            <Timer size={13} /> Limited drops only
          </button>
          {(query || tier !== "all" || rarity !== "any" || limitedOnly) && (
            <button
              type="button"
              className="ghost-btn small"
              onClick={() => {
                setQuery("");
                setTier("all");
                setRarity("any");
                setLimitedOnly(false);
              }}
            >
              Reset
            </button>
          )}
        </div>
      ) : null}

      {loading ? (
        <div className="plates-loading">
          <Loader2 size={20} className="spin" /> Loading the catalogue…
        </div>
      ) : error ? (
        <div className="plates-empty">
          <Palette size={24} />
          <strong>{error}</strong>
          <button type="button" className="primary-btn" onClick={() => void load()}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="plates-empty">
          <Palette size={24} />
          <strong>No nameplates match those filters</strong>
          <span>Try another search, access tier or rarity.</span>
        </div>
      ) : (
        <div className="np-grid">
          {visible.map((plate) => {
            const left = daysLeft(plate.endsAt);
            const working = busy === plate.id;
            const saving = busy === `fav-${plate.id}`;
            return (
              <article
                key={plate.id}
                className={cls(
                  "np-card",
                  plate.equipped && "is-equipped",
                  !plate.equippable && "is-locked",
                  plate.unlock === "owner" && "is-owner",
                  `rarity-${plate.rarity}`,
                )}
              >
                <div className="np-stage">
                  {plate.limited ? (
                    <span className={cls("np-flag", left === 0 && "np-flag-ended")}>
                      <Timer size={10} /> {left === 0 ? "Drop ended" : `${left} ${left === 1 ? "day" : "days"} left`}
                    </span>
                  ) : plate.unlock === "owner" ? (
                    <span className="np-flag np-flag-owner">
                      <Crown size={10} /> Owner · 1 of 1
                    </span>
                  ) : plate.isNew ? (
                    <span className="np-flag np-flag-new">New</span>
                  ) : null}

                  <button
                    type="button"
                    className={cls("np-heart", plate.favorite && "active")}
                    aria-pressed={plate.favorite}
                    aria-label={plate.favorite ? `Remove ${plate.name} from favourites` : `Save ${plate.name} to favourites`}
                    onClick={() => void unfavorite(plate)}
                    disabled={saving}
                  >
                    {saving ? <Loader2 size={14} className="spin" /> : <Heart size={14} fill={plate.favorite ? "currentColor" : "none"} />}
                  </button>

                  <div className="np-context" aria-hidden="true">
                    <span className="np-ghost">
                      <i className="np-ghost-avatar" />
                      <i className="np-ghost-line" />
                    </span>
                    <span className="np-ghost np-ghost-out">
                      <i className="np-ghost-avatar" />
                      <i className="np-ghost-line" />
                    </span>
                  </div>

                  <div className={cls("np-pill", plateClass(plate.id))}>
                    <PlateArt id={plate.id} />
                    <Avatar
                      user={{
                        id: app.me.user.id,
                        username: app.me.user.username,
                        displayName: app.me.user.displayName,
                        avatarId: app.me.user.avatarId,
                        accentColor: app.me.user.accentColor,
                        plusDecoration: app.me.user.plusDecoration,
                      }}
                      size={32}
                      showStatus
                    />
                    <span className="np-id-copy">
                      <span className="np-id-name">
                        <span className="plate-label">
                          {plate.unlock === "owner" ? "zuno" : app.me.user.displayName}
                        </span>
                        {(plate.unlock === "owner" || verified) && <Verified />}
                      </span>
                      <span className="np-id-status">
                        {plate.unlock === "owner" ? "ZUNO OWNER" : app.me.user.customStatus || `@${app.me.user.username}`}
                      </span>
                    </span>
                    {plate.unlock === "owner" ? (
                      <span className="np-pill-crown" aria-hidden="true">
                        <Crown size={15} />
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="np-body">
                  <h3>{plate.name}</h3>
                  <div className="np-meta">
                    {plate.unlock === "plus" ? (
                      <span className="np-access np-access-plus">
                        <Sparkles size={11} /> ZUNO PLUS
                      </span>
                    ) : plate.unlock === "owner" ? (
                      <span className="np-access np-access-owner">
                        <Crown size={11} /> Owner
                      </span>
                    ) : (
                      <span className="np-access">Free</span>
                    )}
                    <span className={cls("np-rarity", `rarity-${plate.rarity}`)}>{plate.rarity}</span>
                    {plate.equippedBy > 0 ? <span className="np-worn">{plate.equippedBy} wearing</span> : null}
                  </div>
                  <p>{plate.description}</p>
                </div>

                <div className="np-foot">
                  {plate.equipped ? (
                    <span className="np-equipped">
                      <Check size={13} /> Equipped
                    </span>
                  ) : plate.equippable ? (
                    <button type="button" className="primary-btn small" onClick={() => void equip(plate)} disabled={busy !== null}>
                      {working ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
                      {plate.unlocked ? "Equip" : "Unlock & equip"}
                    </button>
                  ) : (
                    <button type="button" className="ghost-btn small" disabled title={plate.unlockHint}>
                      <Lock size={12} /> {plate.limited && left === 0 ? "Drop ended" : "Locked"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
