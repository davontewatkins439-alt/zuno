import React, { useMemo } from "react";
import { Crown, MicOff, Monitor, Search, X } from "lucide-react";
import { useApp } from "../state";
import type { ServerMember } from "../lib/types";
import { cls } from "../lib/utils";
import { plateClass } from "../lib/nameplates";
import { PlateArt } from "./PlateArt";
import { Avatar, BadgeRow, IconButton, Verified } from "./ui";

function roleColorFor(member: ServerMember, roles: { id: string; color: string | null; position: number }[]) {
  const owned = roles.filter((r) => member.roleIds.includes(r.id)).sort((a, b) => b.position - a.position);
  return owned[0]?.color ?? null;
}

export function MemberPanel({ onClose }: { onClose: () => void }) {
  const { server, setPanel, openProfile } = useApp();
  const members = server?.members ?? [];

  const grouped = useMemo(() => {
    if (!server) return [];
    const roles = server.roles.filter((r) => !r.is_everyone).sort((a, b) => b.position - a.position);
    const byId = new Map(members.map((m) => [m.id, m]));
    const used = new Set<string>();
    const groups: { id: string; label: string; color: string | null; members: ServerMember[] }[] = [];

    for (const role of roles) {
      const list = members.filter((m) => m.roleIds.includes(role.id));
      if (!list.length) continue;
      list.forEach((m) => used.add(m.id));
      groups.push({ id: role.id, label: role.name, color: role.color, members: list });
    }
    const rest = members.filter((m) => !used.has(m.id) || m.roleIds.length === 0);
    if (rest.length) groups.push({ id: "everyone", label: "Members", color: null, members: rest });
    for (const group of groups) {
      group.members.sort((a, b) => {
        const aOff = a.status === "offline" ? 1 : 0;
        const bOff = b.status === "offline" ? 1 : 0;
        if (aOff !== bOff) return aOff - bOff;
        return (a.nickname || a.displayName).localeCompare(b.nickname || b.displayName);
      });
    }
    byId.clear();
    return groups;
  }, [members, server]);

  if (!server) return null;
  const voiceByUser = new Map((server.voiceStates ?? []).map((v) => [v.userId, v]));

  return (
    <aside className="member-panel">
      <header className="member-head">
        <div>
          <h3>{server.server.name}</h3>
          <p>
            {server.server.memberCount} members · {server.server.onlineCount} online
          </p>
        </div>
        <div className="member-head-actions">
          <IconButton label="Search messages" onClick={() => setPanel({ type: "search" })}>
            <Search size={15} />
          </IconButton>
          <IconButton label="Hide members" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
      </header>

      <div className="member-scroll">
        {grouped.map((group) => (
          <section className="member-group" key={group.id}>
            <div className="member-group-label">
              {group.label} — {group.members.length}
            </div>
            {group.members.map((member) => {
              const color = roleColorFor(member, server.roles) ?? group.color;
              const voiceState = voiceByUser.get(member.id);
              return (
                <button
                  type="button"
                  key={member.id}
                  className={cls("member-row", member.status === "offline" && "offline", member.isServerOwner && "server-owner")}
                  onClick={() => void openProfile(member.id)}
                >
                  <Avatar
                    user={member}
                    size={32}
                    showStatus
                    decoration={member.plusDecoration}
                  />
                  <span className="member-copy">
                    <span className={cls("member-name", "plate-name", plateClass(member.nameplate))} style={color ? { color } : undefined}>
                      <PlateArt id={member.nameplate} />
                      <span className="plate-label">{member.nickname || member.displayName}</span>
                      {member.isOwner && (
                        <span className="crown" title="ZUNO Owner">
                          <Crown size={12} />
                        </span>
                      )}
                      {!member.isOwner && member.badges.some((b) => b.slug === "verified") && <Verified />}
                    </span>
                    {(member.customStatus || member.serverBio) && (
                      <span className="member-status">{member.customStatus || member.serverBio}</span>
                    )}
                    {member.badges.length > 0 && <BadgeRow badges={member.badges} max={2} compact />}
                  </span>
                  {voiceState?.muted && <MicOff size={13} className="member-voice-icon" />}
                  {voiceState?.screen && <Monitor size={13} className="member-voice-icon" />}
                </button>
              );
            })}
          </section>
        ))}
        {!grouped.length && <p className="sidebar-empty">No members to show.</p>}
      </div>

      <button type="button" className="member-invite" onClick={() => setPanel({ type: "search" })}>
        Search this community
      </button>
    </aside>
  );
}
