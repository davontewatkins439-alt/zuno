import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Crown,
  Gift,
  Heart,
  Layers,
  Loader2,
  Lock,
  Package,
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
import type { NameplateBundle, Nameplate } from "../lib/types";
import { cls } from "../lib/utils";
import { plateClass } from "../lib/nameplates";
import { Avatar, Modal, Verified } from "./ui";
import { PlateArt } from "./PlateArt";

interface Payload {
  plusActive: boolean;
  equipped: string | null;
  bundles: NameplateBundle[];
  nameplates: Nameplate[];
}

type Mode = "bundles" | "plates";

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

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function BundleArt({ bundle }: { bundle: NameplateBundle }) {
  const shown = bundle.pieces.slice(0, 3);
  return (
    <div className={cls("bundle-art", `rarity-${bundle.rarity}`)} aria-hidden="true">
      <span className="bundle-art-halo" />
      <div className="bundle-stack">
        {shown.map((piece, index) => (
          <div key={piece.id} className={cls("bundle-pill", plateClass(piece.id))} style={{ zIndex: shown.length - index }}>
            <PlateArt id={piece.id} />
            <span className="bundle-pill-label">{piece.name}</span>
          </div>
        ))}
      </div>
      <span className="bundle-pcs">
        <Layers size={11} /> {bundle.total}pc
      </span>
    </div>
  );
}

export function NameplatesView() {
  const app = useApp();
  const [mode, setMode] = useState<Mode>("bundles");
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
  const [openBundleId, setOpenBundleId] = useState<string | null>(null);
  const [bundleTier, setBundleTier] = useState<string>("all");
  const [bundleQuery, setBundleQuery] = useState("");
  const [bundleSort, setBundleSort] = useState<SortId>("popular");

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

  const equipPlate = async (id: string, name: string) => {
    setBusy(id);
    try {
      await api(`/api/nameplates/${id}/unlock`, { method: "POST" }).catch(() => undefined);
      await api(`/api/nameplates/${id}/equip`, { method: "POST" });
      await Promise.all([load(), app.refreshMe(true)]);
      app.toast(`${name} equipped`, "success");
    } catch (err) {
      app.toast(err instanceof ApiError ? err.message : "That nameplate could not be equipped.", "error");
    } finally {
      setBusy(null);
    }
  };

  const equip = (plate: Nameplate) => equipPlate(plate.id, plate.name);

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

  const favoriteBundle = async (bundle: NameplateBundle) => {
    setBusy(`bfav-${bundle.id}`);
    try {
      const res = await api<{ favorite: boolean }>(`/api/bundles/${bundle.id}/favorite`, { method: "POST" });
      setData((prev) =>
        prev
          ? {
              ...prev,
              bundles: prev.bundles.map((entry) =>
                entry.id === bundle.id ? { ...entry, favorite: res.favorite } : entry,
              ),
            }
          : prev,
      );
    } catch (err) {
      app.toast(err instanceof ApiError ? err.message : "Could not update favourites.", "error");
    } finally {
      setBusy(null);
    }
  };

  const claimBundle = async (bundle: NameplateBundle) => {
    setBusy(`bundle-${bundle.id}`);
    try {
      const res = await api<{ added: number; total: number }>(`/api/bundles/${bundle.id}/claim`, { method: "POST" });
      await load();
      app.toast(
        res.added > 0
          ? `${res.added} of ${res.total} plates added to your collection`
          : "You already own every plate in this bundle",
        "success",
      );
    } catch (err) {
      app.toast(err instanceof ApiError ? err.message : "That bundle could not be claimed.", "error");
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
  const bundles = data?.bundles ?? [];
  const isOwner = app.me.user.isOwner;

  const visibleBundles = useMemo(() => {
    const q = bundleQuery.trim().toLowerCase();
    const list = bundles.filter((bundle) => {
      if (bundleTier === "owner" && bundle.unlock !== "owner") return false;
      if (bundleTier === "plus" && bundle.unlock !== "plus") return false;
      if (bundleTier === "owned" && !bundle.claimed) return false;
      if (bundleTier === "favorites" && !bundle.favorite) return false;
      if (!q) return true;
      return bundle.name.toLowerCase().includes(q) || (bundle.description ?? "").toLowerCase().includes(q);
    });
    return list.sort((a, b) => {
      if (bundleSort === "newest") return b.releasedAt - a.releasedAt || a.name.localeCompare(b.name);
      if (bundleSort === "rarity") return (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0) || a.name.localeCompare(b.name);
      if (bundleSort === "az") return a.name.localeCompare(b.name);
      return b.total - a.total || a.name.localeCompare(b.name);
    });
  }, [bundles, bundleTier, bundleQuery, bundleSort]);

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
  const ownerBundleCount = bundles.filter((bundle) => bundle.unlock === "owner").length;
  const openBundle = openBundleId ? bundles.find((bundle) => bundle.id === openBundleId) ?? null : null;

  const renderBundleAction = (bundle: NameplateBundle) => {
    const working = busy === `bundle-${bundle.id}`;
    const left = daysLeft(bundle.endsAt);
    if (bundle.claimed) {
      return (
        <span className="np-equipped">
          <Check size={13} /> All {bundle.total} owned
        </span>
      );
    }
    if (bundle.unlock === "owner" && !isOwner) {
      return (
        <button type="button" className="ghost-btn small" disabled title={bundle.unlockHint}>
          <Lock size={12} /> Owner only
        </button>
      );
    }
    if (bundle.limited && left === 0) {
      return (
        <button type="button" className="ghost-btn small" disabled>
          <Timer size={12} /> Drop ended
        </button>
      );
    }
    if (bundle.claimable) {
      return (
        <button type="button" className="primary-btn small" onClick={() => void claimBundle(bundle)} disabled={busy !== null}>
          {working ? <Loader2 size={12} className="spin" /> : <Gift size={12} />}
          {bundle.ownedCount > 0 ? `Add ${bundle.total - bundle.ownedCount} plates` : "Add to my plates"}
        </button>
      );
    }
    return (
      <button type="button" className="ghost-btn small" onClick={() => app.navigate("/plus")}>
        <Sparkles size={12} /> Get ZUNO PLUS
      </button>
    );
  };

  return (
    <section className="plates-view">
      <header className="plates-head">
        <div>
          <span className="eyebrow">
            <Palette size={14} /> ZUNO NAME COSMETICS
          </span>
          <h1>
            {mode === "bundles" ? "Bundles" : "Nameplates"}{" "}
            <span className="plates-total">({mode === "bundles" ? bundles.length : plates.length})</span>
          </h1>
          <p>
            {mode === "bundles"
              ? "Themed packs of plates. Everything here is included with ZUNO PLUS — claim a pack and its plates stay in your collection."
              : "Paint the banner behind your display name. Your plate follows you into every server, DM and profile."}
          </p>
        </div>
        <div className="plates-head-tools">
          {mode === "bundles" ? (
            <>
              <label className="plates-sortby">
                <span>Sort by</span>
                <select value={bundleSort} onChange={(event) => setBundleSort(event.target.value as SortId)}>
                  <option value="popular">Popular</option>
                  <option value="newest">Newest</option>
                  <option value="rarity">Rarity</option>
                  <option value="az">A–Z</option>
                </select>
              </label>
              <label className="plates-search compact">
                <Search size={14} />
                <input
                  value={bundleQuery}
                  onChange={(event) => setBundleQuery(event.target.value)}
                  placeholder="Search bundles"
                  aria-label="Search bundles"
                />
              </label>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </header>

      <div className="plates-modes" role="tablist" aria-label="Cosmetics section">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "bundles"}
          className={cls("plates-mode", mode === "bundles" && "active")}
          onClick={() => setMode("bundles")}
        >
          <Package size={15} /> Bundles <em>{bundles.length}</em>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "plates"}
          className={cls("plates-mode", mode === "plates" && "active")}
          onClick={() => setMode("plates")}
        >
          <Palette size={15} /> Nameplates <em>{plates.length}</em>
        </button>
      </div>

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

      {mode === "bundles" ? (
        <>
          <div className="plates-filters bundle-filters" role="tablist" aria-label="Bundle access">
            {[
              { id: "all", label: `All bundles` },
              { id: "plus", label: "ZUNO PLUS" },
              { id: "owner", label: `Owner (${ownerBundleCount})` },
              { id: "owned", label: "Fully owned" },
              { id: "favorites", label: "Favourites" },
            ].map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={bundleTier === entry.id}
                className={cls(bundleTier === entry.id && "active")}
                onClick={() => setBundleTier(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="plates-loading">
              <Loader2 size={20} className="spin" /> Loading the shop…
            </div>
          ) : error ? (
            <div className="plates-empty">
              <Package size={24} />
              <strong>{error}</strong>
              <button type="button" className="primary-btn" onClick={() => void load()}>
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          ) : visibleBundles.length === 0 ? (
            <div className="plates-empty">
              <Package size={24} />
              <strong>No bundles match those filters</strong>
              <span>Try another search or access tier.</span>
            </div>
          ) : (
            <div className="bundle-grid">
              {visibleBundles.map((bundle) => {
                const left = daysLeft(bundle.endsAt);
                const saving = busy === `bfav-${bundle.id}`;
                return (
                  <article
                    key={bundle.id}
                    className={cls(
                      "bundle-card",
                      `rarity-${bundle.rarity}`,
                      bundle.claimed && "is-owned",
                      bundle.unlock === "owner" && "is-owner",
                      !bundle.claimable && !bundle.claimed && "is-locked",
                    )}
                  >
                    <div className="bundle-stage">
                      {bundle.limited ? (
                        <span className={cls("np-flag", left === 0 && "np-flag-ended")}>
                          <Timer size={10} /> {left === 0 ? "Drop ended" : `${left} ${left === 1 ? "day" : "days"} left`}
                        </span>
                      ) : bundle.unlock === "owner" ? (
                        <span className="np-flag np-flag-owner">
                          <Crown size={10} /> Owner bundle
                        </span>
                      ) : bundle.isNew ? (
                        <span className="np-flag np-flag-new">New</span>
                      ) : null}

                      <button
                        type="button"
                        className={cls("np-heart", bundle.favorite && "active")}
                        aria-pressed={bundle.favorite}
                        aria-label={bundle.favorite ? `Unsave ${bundle.name}` : `Save ${bundle.name}`}
                        onClick={() => void favoriteBundle(bundle)}
                        disabled={saving}
                      >
                        {saving ? <Loader2 size={14} className="spin" /> : <Heart size={14} fill={bundle.favorite ? "currentColor" : "none"} />}
                      </button>

                      <button
                        type="button"
                        className="bundle-stage-btn"
                        onClick={() => setOpenBundleId(bundle.id)}
                        aria-label={`Preview the ${bundle.name}`}
                      >
                        <BundleArt bundle={bundle} />
                      </button>
                    </div>

                    <div className="bundle-body">
                      <h3>{bundle.name}</h3>
                      <div className="bundle-meta">
                        {bundle.unlock === "plus" ? (
                          <span className="np-access np-access-plus">
                            <Sparkles size={11} /> ZUNO PLUS
                          </span>
                        ) : (
                          <span className="np-access np-access-owner">
                            <Crown size={11} /> Owner
                          </span>
                        )}
                        <span className={cls("np-rarity", `rarity-${bundle.rarity}`)}>{bundle.rarity}</span>
                        <span className="bundle-owned-count">
                          {bundle.ownedCount}/{bundle.total} owned
                        </span>
                      </div>
                      <p>{bundle.description}</p>
                    </div>

                    <div className="bundle-price">
                      {bundle.priceCents > 0 ? (
                        <>
                          <strong>{money(bundle.priceCents)}</strong>
                          {bundle.compareCents > bundle.priceCents ? (
                            <>
                              <s>{money(bundle.compareCents)}</s>
                              <em>−{bundle.discount}%</em>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <strong className="bundle-price-owner">Included with ownership</strong>
                      )}
                      <span className="bundle-price-note">bundle value · no extra charge</span>
                    </div>

                    <div className="bundle-foot">
                      <button type="button" className="ghost-btn small" onClick={() => setOpenBundleId(bundle.id)}>
                        {bundle.total} plates
                      </button>
                      {renderBundleAction(bundle)}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
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
                          size={28}
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
        </>
      )}

      {openBundle ? (
        <Modal
          title={openBundle.name}
          subtitle={openBundle.description ?? undefined}
          onClose={() => setOpenBundleId(null)}
          wide
          className="bundle-modal"
          footer={
            <>
              <span className="bundle-modal-count">
                {openBundle.ownedCount} of {openBundle.total} plates owned
              </span>
              {renderBundleAction(openBundle)}
            </>
          }
        >
          <div className="bundle-detail-grid">
            {openBundle.pieces.map((piece) => (
              <article key={piece.id} className={cls("bundle-detail-card", piece.equipped && "is-equipped")}>
                <div className={cls("np-pill", "np-pill-mini", plateClass(piece.id))}>
                  <PlateArt id={piece.id} />
                  <span className="np-id-copy">
                    <span className="np-id-name">
                      <span className="plate-label">{piece.name}</span>
                    </span>
                    <span className="np-id-status">{piece.rarity}</span>
                  </span>
                </div>
                <div className="bundle-detail-foot">
                  {piece.equipped ? (
                    <span className="np-equipped">
                      <Check size={12} /> Equipped
                    </span>
                  ) : piece.equippable ? (
                    <button
                      type="button"
                      className="primary-btn small"
                      onClick={() => void equipPlate(piece.id, piece.name)}
                      disabled={busy !== null}
                    >
                      {busy === piece.id ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
                      Equip
                    </button>
                  ) : (
                    <button type="button" className="ghost-btn small" disabled>
                      <Lock size={12} /> Locked
                    </button>
                  )}
                  {piece.wornBy > 0 ? <span className="np-worn">{piece.wornBy} wearing</span> : null}
                </div>
              </article>
            ))}
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
