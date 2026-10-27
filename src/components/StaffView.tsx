import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Briefcase, Check, Clock, ShieldCheck, Sparkles, X } from "lucide-react";
import { useApp } from "../state";
import { api, ApiError } from "../lib/api";
import { formatShort } from "../lib/utils";

interface Application {
  id: string;
  position: string;
  why: string;
  experience: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: number;
  reviewedAt: number | null;
}

const ROLES = [
  {
    title: "Moderator",
    blurb: "Keep channels calm, handle reports and welcome new members.",
  },
  {
    title: "Manager",
    blurb: "Lead a squad of moderators, own escalations and staff scheduling.",
  },
  {
    title: "Admin",
    blurb: "Help run the platform: accounts, servers, configuration and policy.",
  },
  {
    title: "Support Agent",
    blurb: "Answer questions in help channels and untangle account issues.",
  },
  {
    title: "Events Host",
    blurb: "Plan watch parties, game nights and voice events for the city.",
  },
  {
    title: "Content Creator",
    blurb: "Make clips, art and announcements that pull people in.",
  },
  {
    title: "Community Founder",
    blurb: "Grow a thriving ZUNO community and lead it as its founder.",
  },
];

export function StaffView() {
  const { me, toast } = useApp();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState(ROLES[0].title);
  const [why, setWhy] = useState("");
  const [experience, setExperience] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await api<{ applications: Application[] }>("/api/staff-applications");
      setApplications(data.applications);
    } catch {
      /* the form still works if the history call fails */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const pending = useMemo(() => applications.find((a) => a.status === "pending"), [applications]);
  const latest = applications[0];
  const alreadyStaff = me.user.platformRole && me.user.platformRole !== "user";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (why.trim().length < 20) {
      setError("Tell us why you want the role — at least 20 characters.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/staff-applications", {
        method: "POST",
        body: { position, why: why.trim(), experience: experience.trim() },
      });
      setWhy("");
      setExperience("");
      await load();
      toast("Application sent — the team will review it", "success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send your application.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="staff-view">
      <header className="staff-hero">
        <div className="staff-hero-glow" />
        <span className="eyebrow">
          <Briefcase size={15} /> ZUNO STAFF
        </span>
        <h1>
          Join the <span>crew.</span>
        </h1>
        <p>
          ZUNO is run by a small team of people who actually use it. If you know this city well and want to help it grow,
          send an application — the owner reads every one.
        </p>
      </header>

      <div className="staff-grid">
        <div className="staff-main">
          <div className="staff-section-head">
            <h2>Open roles</h2>
            <span>{ROLES.length} roles · you can apply for one at a time</span>
          </div>
          <div className="staff-roles">
            {ROLES.map((role) => (
              <button
                type="button"
                key={role.title}
                className={`staff-role${position === role.title ? " active" : ""}`}
                onClick={() => setPosition(role.title)}
              >
                <strong>{role.title}</strong>
                <span>{role.blurb}</span>
                {position === role.title && <Check size={14} className="staff-role-check" />}
              </button>
            ))}
          </div>

          {pending ? (
            <div className="staff-status pending">
              <Clock size={16} />
              <div>
                <strong>Application under review</strong>
                <span>
                  You applied for {pending.position} on {formatShort(pending.createdAt)}. You can send another application
                  once this one is decided.
                </span>
              </div>
            </div>
          ) : alreadyStaff ? (
            <div className="staff-status approved">
              <ShieldCheck size={16} />
              <div>
                <strong>You are already on the team</strong>
                <span>Your platform role is {me.user.platformRole}. Applications are for members who are not staff yet.</span>
              </div>
            </div>
          ) : (
            <form className="staff-form" onSubmit={submit}>
              <div className="staff-section-head">
                <h2>Your application</h2>
                <span>Sending as @{me.user.username}</span>
              </div>
              <label className="field">
                <span>Role</span>
                <select value={position} onChange={(e) => setPosition(e.target.value)}>
                  {ROLES.map((role) => (
                    <option key={role.title} value={role.title}>
                      {role.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Why do you want this role?</span>
                <textarea
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  rows={4}
                  maxLength={1500}
                  placeholder="What would you do in your first week? What do you care about in a community?"
                />
                <small>{why.trim().length}/1500 · at least 20 characters</small>
              </label>
              <label className="field">
                <span>Experience (optional)</span>
                <textarea
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  rows={3}
                  maxLength={1500}
                  placeholder="Communities you have moderated, events you have run, tools you have built."
                />
              </label>
              {error && <p className="form-error">{error}</p>}
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? "Sending…" : "Send application"}
                {!busy && <ArrowRight size={15} />}
              </button>
            </form>
          )}

          {latest?.status === "denied" && !pending && (
            <div className="staff-status denied">
              <X size={16} />
              <div>
                <strong>Last application was not accepted</strong>
                <span>{latest.reviewNote || "The team did not leave a note."} You can apply again when you are ready.</span>
              </div>
            </div>
          )}
        </div>

        <aside className="staff-side">
          <div className="staff-side-card">
            <h3>
              <Sparkles size={14} /> What we look for
            </h3>
            <ul>
              <li>You are active in ZUNO, not just passing through.</li>
              <li>You de-escalate instead of picking sides.</li>
              <li>You can keep a secret — staff channels stay private.</li>
              <li>You follow the same rules you would enforce.</li>
            </ul>
          </div>

          <div className="staff-side-card">
            <h3>
              <Briefcase size={14} /> Your applications
            </h3>
            {loading && <p className="sidebar-empty">Loading…</p>}
            {!loading && !applications.length && <p className="sidebar-empty">You have not applied yet.</p>}
            {applications.map((application) => (
              <div className={`staff-history ${application.status}`} key={application.id}>
                <div>
                  <strong>{application.position}</strong>
                  <span>{formatShort(application.createdAt)}</span>
                </div>
                <em>{application.status}</em>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
