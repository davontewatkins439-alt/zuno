import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Crown, Loader2, Lock, Palette, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { useApp } from "../state";
import { api, ApiError } from "../lib/api";
import type { Nameplate } from "../lib/types";
import { cls } from "../lib/utils";
import { plateClass } from "../lib/nameplates";
import { Avatar } from "./ui";

interface Payload {
  plusActive: boolean;
  equipped: string | null;
  nameplates: Nameplate[];
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "free", label: "Free" },
  { id: "plus", label: "ZUNO PLUS" },
  { id: "owner", label: "Owner" },
] as const;

export function NameplatesView() {
  const app = useApp();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<"popular" | "newest" | "rarity">("popular");
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

  const act = async (plate: Nameplate) => {
    setBusy(plate.id);
    try {
      if (!plate.unlocked) {
        await api(`/api/nameplates/${plate.id}/unlock`, { method: "POST" });
      }
      await api(`/api/nameplates/${plate.id}/equip`, { method: "POST" });
      await Promise.all([load(), app.refreshMe(true)]);
      app.toast(`${plate.name} equipped`, "success");
    } catch (err) {
      app.toast(err instanceof ApiError ? err.message : "That nameplate could not be equipped.", "error");
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

  const rarityRank: Record<string, number> = { legendary: 3, premium: 2, standard: 1 };

  const visible = useMemo(() => {
    const list = (data?.nameplates ?? []).filter((plate) => {
      if (filter === "free" && plate.unlock !== "free") return false;
      if (filter === "plus" && plate.unlock !== "plus") return false;
      if (filter === "owner" && plate.unlock !== "owner") return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return plate.name.toLowerCase().includes(q) || (plate.description ?? "").toLowerCase().includes(q);
    });
    return list.sort((a, b) => {
      if (sort === "newest") return b.id.localeCompare(a.id);
      if (sort === "rarity") return (rarityRank[b.rarity] ?? 0) - (rarityRank[a.rarity] ?? 0) || a.name.localeCompare(b.name);
      return b.equippedBy - a.equippedBy || a.name.localeCompare(b.name);
    });
  }, [data?.nameplates, filter, query, sort]);

  const equipped = data?.nameplates.find((plate) => plate.equipped) ?? null;

  return (
    <section className="plates-view">
      <header className="plates-head">
        <div>
          <span className="eyebrow">
            <Palette size={14} /> ZUNO NAME COSMETICS
          </span>
          <h1>Nameplates</h1>
          <p>Your name, but louder. Plates paint a banner behind your display name everywhere it appears.</p>
        </div>
        <div className="plates-count">
          <strong>{data?.nameplates.length ?? 0}</strong>
          <span>plates</span>
        </div>
      </header>

      {equipped && (
        <article className="plates-current">
          <span className={cls("plates-current-name", plateClass(equipped.id))}>{app.me.user.displayName}</span>
          <div>
            <strong>{equipped.name}</strong>
            <span>Equipped right now</span>
          </div>
          <button type="button" className="ghost-btn small" onClick={() => void clear()} disabled={busy !== null}>
            {busy === "clear" ? <Loader2 size={13} className="spin" /> : <X size={13} />} Remove
          </button>
        </article>
      )}

      <div className="plates-toolbar">
        <label className="plates-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search nameplates" aria-label="Search nameplates" />
        </label>
        <div className="plates-filters" role="tablist" aria-label="Nameplate access">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={filter === entry.id}
              className={cls(filter === entry.id && "active")}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <label className="plates-sort">
          Sort by
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="popular">Popular</option>
            <option value="newest">Newest</option>
            <option value="rarity">Rarity</option>
          </select>
        </label>
      </div>

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
          <strong>No nameplates match that filter</strong>
          <span>Try another search or category.</span>
        </div>
      ) : (
        <div className="plates-grid">
          {visible.map((plate) => {
            const locked = !plate.unlocked;
            const working = busy === plate.id;
            return (
              <article key={plate.id} className={cls("plate-card", plate.equipped && "is-equipped", locked && "is-locked")}>
                <div className={cls("plate-preview", plateClass(plate.id))} aria-hidden="true">
                  <span className="plate-preview-avatar">
                    <Avatar
                      user={{
                        id: app.me.user.id,
                        username: app.me.user.username,
                        displayName: app.me.user.displayName,
                        avatarId: app.me.user.avatarId,
                        accentColor: app.me.user.accentColor,
                        plusDecoration: app.me.user.plusDecoration,
                      }}
                      size={26}
                    />
                  </span>
                  <span className="plate-preview-name">{app.me.user.displayName}</span>
                </div>

                <header className="plate-card-head">
                  <h3>{plate.name}</h3>
                  <span className={cls("plate-rarity", `rarity-${plate.rarity}`)}>{plate.rarity}</span>
                </header>
                <p>{plate.description}</p>

                <footer className="plate-card-foot">
                  <span className="plate-access">
                    {plate.unlock === "plus" ? (
                      <>
                        <Sparkles size={12} /> ZUNO PLUS
                      </>
                    ) : plate.unlock === "owner" ? (
                      <>
                        <Crown size={12} /> Owner only
                      </>
                    ) : (
                      "Free"
                    )}
                  </span>
                  {plate.equipped ? (
                    <span className="plate-equipped">
                      <Check size={13} /> Equipped
                    </span>
                  ) : locked ? (
                    <button type="button" className="ghost-btn small" disabled title={plate.unlockHint}>
                      <Lock size={12} /> Locked
                    </button>
                  ) : (
                    <button type="button" className="primary-btn small" onClick={() => void act(plate)} disabled={busy !== null}>
                      {working ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Equip
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
