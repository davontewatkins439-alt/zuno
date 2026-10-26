import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Menu, RefreshCw, X } from "lucide-react";
import { ApiError, api } from "./lib/api";
import type { Me, PublicConfig } from "./lib/types";
import { AppProvider, useApp } from "./state";
import { cls } from "./lib/utils";
import { AuthPage } from "./components/AuthPage";
import { ServerRail } from "./components/ServerRail";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { HomeView, FriendsView, DiscoverView } from "./components/Views";
import { OwnerDashboard } from "./components/OwnerDashboard";
import { PlusStore } from "./components/PlusStore";
import { StaffView } from "./components/StaffView";
import { InviteLanding } from "./components/InviteLanding";
import { RightPanel } from "./components/Panels";
import { CallOverlay } from "./components/CallOverlay";
import { ModalHost } from "./components/ModalHost";
import { ZunoMark, ZunoWordmark } from "./components/ui";

const inviteCode = (() => {
  const match = window.location.pathname.match(/^\/invite\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
})();

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<"loading" | "anon" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await api<Me>("/api/me");
      setMe(data);
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setStatus("anon");
      } else {
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading") {
    return (
      <div className="boot-screen">
        <ZunoWordmark />
        <span className="spinner" />
        <p>Waking the city…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="boot-screen">
        <AlertTriangle size={30} />
        <h1>ZUNO is unreachable</h1>
        <p>The API did not respond. Check your connection and try again.</p>
        <button type="button" className="primary-btn" onClick={() => void load()}>
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    );
  }

  if (status === "anon" || !me) {
    return (
      <AuthPage
        inviteCode={inviteCode}
        onAuthed={(next) => {
          setMe(next);
          setStatus("ready");
        }}
      />
    );
  }

  const signOut = async () => {
    try {
      await api("/api/logout", { method: "POST", body: {} });
    } catch {
      /* ignore */
    }
    setMe(null);
    setStatus("anon");
  };

  if (me.user.banned) {
    return <SuspendedScreen me={me} onSignOut={() => void signOut()} />;
  }

  if (me.config.maintenance && !me.user.isOwner) {
    return (
      <div className="boot-screen maintenance-screen">
        <ZunoMark size={54} />
        <h1>{me.config.siteName} is under maintenance</h1>
        <p>{me.config.maintenanceMessage || "We are shipping an upgrade. Back in a moment."}</p>
        <button type="button" className="ghost-btn" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <AppProvider
      initialMe={me}
      onSessionLost={() => {
        setMe(null);
        setStatus("anon");
      }}
    >
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const app = useApp();
  const [mobileNav, setMobileNav] = useState(false);
  const isChat = app.route.name === "server" || app.route.name === "dm";

  useEffect(() => {
    setMobileNav(false);
  }, [app.route]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        app.openModal({ type: "newDm" });
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        void app.toggleMute();
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        void app.toggleDeafen();
      }
      if (e.key === "Escape") {
        if (app.modal) app.closeModal();
      }
      if (e.shiftKey && e.key === "Escape") {
        void app.markNotificationsRead();
        void app.refreshMe(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const plusState = params.get("plus");
    if (plusState) {
      if (plusState === "success") {
        app.toast("Checkout complete — PLUS activates as soon as the payment provider confirms it.", "info");
        void app.refreshMe(true);
        // The signed webhook usually lands a moment after the redirect.
        window.setTimeout(() => void app.refreshMe(true), 3000);
      } else if (plusState === "cancelled") {
        app.toast("Checkout cancelled. Nothing was charged.", "info");
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const content =
    app.route.name === "owner" ? (
      <OwnerDashboard />
    ) : app.route.name === "plus" ? (
      <PlusStore />
    ) : app.route.name === "staff" ? (
      <StaffView />
    ) : app.route.name === "friends" ? (
      <FriendsView />
    ) : app.route.name === "discover" ? (
      <DiscoverView />
    ) : app.route.name === "invite" ? (
      <InviteLanding code={app.route.code} />
    ) : app.route.name === "server" || app.route.name === "dm" ? (
      <ChatView />
    ) : (
      <HomeView />
    );

  return (
    <div className="app-shell">
      <ServerRail />
      <div className={cls("sidebar-shell", mobileNav && "mobile-open")}>
        <Sidebar />
      </div>
      {mobileNav && <div className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-hidden="true" />}
      <main className="center">
        <button type="button" className="mobile-nav-btn" aria-label="Open navigation" onClick={() => setMobileNav(true)}>
          <Menu size={17} />
        </button>
        {content}
      </main>
      {isChat && <RightPanel onCloseMembers={() => app.setPanel({ type: "none" })} />}
      <CallOverlay />
      <ModalHost />
      <ToastStack />
    </div>
  );
}

function ToastStack() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="status">
      {toasts.map((toast) => (
        <button type="button" key={toast.id} className={cls("toast", toast.tone)} onClick={() => dismissToast(toast.id)}>
          <span>{toast.message}</span>
          <X size={13} />
        </button>
      ))}
    </div>
  );
}

function SuspendedScreen({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ appeals: { id: string; status: string }[] }>("/api/appeals/mine")
      .then((data) => {
        const open = data.appeals.find((a) => a.status === "open");
        if (open) setStatus("open");
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="boot-screen suspended-screen">
      <ZunoMark size={52} />
      <h1>Your ZUNO account is suspended</h1>
      <p>{me.user.banned ? "A ZUNO moderator suspended this account." : ""}</p>
      <p className="suspended-reason">{me.user.customStatus || "You can appeal this decision below. A human reviews every appeal."}</p>
      {status === "open" ? (
        <div className="suspended-card">
          <strong>Your appeal is under review</strong>
          <p>We will notify you here once a ZUNO staff member has reviewed it.</p>
        </div>
      ) : (
        <div className="suspended-card">
          <label className="field">
            <span>Appeal</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={6}
              maxLength={1200}
              placeholder="What happened, and why should your account be restored?"
            />
          </label>
          <button
            type="button"
            className="primary-btn"
            disabled={busy || reason.trim().length < 10}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/appeals", { method: "POST", body: { reason } });
                setStatus("open");
              } catch (err) {
                setStatus(err instanceof Error ? err.message : "Could not submit appeal");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Submitting…" : "Submit appeal"}
          </button>
          {status && status !== "open" && status !== null && <p className="form-error">{status}</p>}
        </div>
      )}
      <button type="button" className="ghost-btn" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}
