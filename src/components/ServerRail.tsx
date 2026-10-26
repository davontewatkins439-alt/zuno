import React, { useMemo, useState } from "react";
import { Compass, FolderPlus, LogOut, Plus, Settings, UserPlus } from "lucide-react";
import { useApp } from "../state";
import { api } from "../lib/api";
import { avatarGradient, cls, initials } from "../lib/utils";
import { IconButton, ZunoMark } from "./ui";

interface MenuState {
  serverId: string;
  x: number;
  y: number;
}

export function ServerRail() {
  const app = useApp();
  const { me, folders, route, navigate, openModal, refreshMe, toast } = app;
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ folderId: string; x: number; y: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const serverMap = useMemo(() => new Map(me.servers.map((s) => [s.id, s])), [me.servers]);
  const grouped = useMemo(() => {
    const unfiled = me.servers
      .filter((s) => !s.folderId || !folders.some((f) => f.id === s.folderId))
      .sort((a, b) => a.position - b.position);
    const byFolder = folders.map((folder) => ({
      folder,
      servers: me.servers
        .filter((s) => s.folderId === folder.id)
        .sort((a, b) => a.position - b.position),
    }));
    return { unfiled, byFolder };
  }, [me.servers, folders]);

  const homeActive = route.name === "home" || route.name === "friends" || route.name === "dm" || route.name === "discover";
  const activeServerId = route.name === "server" ? route.serverId : null;

  const moveIntoFolder = async (serverId: string, folderId: string) => {
    const folderServers = me.servers.filter((s) => s.folderId === folderId);
    await api("/api/layout", {
      method: "PUT",
      body: {
        servers: [
          ...folderServers.map((s, index) => ({ serverId: s.id, folderId, position: index })),
          { serverId, folderId, position: folderServers.length },
        ],
      },
    });
    await refreshMe(true);
  };

  const createFolderFrom = async (draggedId: string, targetId: string) => {
    try {
      const data = await api<{ folder: { id: string } }>("/api/folders", {
        method: "POST",
        body: { name: "New folder", color: "#2f7cff" },
      });
      await api("/api/layout", {
        method: "PUT",
        body: {
          servers: [
            { serverId: targetId, folderId: data.folder.id, position: 0 },
            { serverId: draggedId, folderId: data.folder.id, position: 1 },
          ],
        },
      });
      setOpenFolders((prev) => ({ ...prev, [data.folder.id]: true }));
      await refreshMe(true);
      toast("Folder created — drag more servers in", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create folder", "error");
    }
  };

  const handleDrop = async (targetId: string, folderId?: string) => {
    if (!dragId || dragId === targetId) return;
    if (folderId) {
      await moveIntoFolder(dragId, folderId);
    } else {
      const target = serverMap.get(targetId);
      if (target?.folderId) await moveIntoFolder(dragId, target.folderId);
      else await createFolderFrom(dragId, targetId);
    }
    setDragId(null);
  };

  const deleteFolder = async (folderId: string) => {
    await api(`/api/folders/${folderId}`, { method: "DELETE" });
    setFolderMenu(null);
    await refreshMe(true);
    toast("Folder removed — servers moved back out");
  };

  const ServerButton = ({ id }: { id: string }) => {
    const server = serverMap.get(id);
    if (!server) return null;
    const active = activeServerId === id;
    const unread = server.unreadCount > 0;
    return (
      <div className="rail-item">
        <span className={cls("rail-pill", active && "active", !active && unread && "unread")} />
        <button
          type="button"
          className={cls("server-btn", active && "active")}
          title={server.name}
          draggable
          onDragStart={() => setDragId(id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void handleDrop(id);
          }}
          onClick={() => navigate(`/channels/${id}`)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ serverId: id, x: e.clientX, y: e.clientY });
          }}
        >
          {server.iconId ? (
            <img src={`/api/files/${server.iconId}`} alt={server.name} />
          ) : (
            <span style={{ background: avatarGradient(id) }}>{initials(server.name)}</span>
          )}
          {server.mentionCount > 0 && <span className="mention-badge">{server.mentionCount > 9 ? "9+" : server.mentionCount}</span>}
          {server.mentionCount === 0 && unread && <span className="unread-dot" />}
        </button>
      </div>
    );
  };

  return (
    <nav className="server-rail" aria-label="Servers">
      <button
        type="button"
        className={cls("home-btn", (route.name === "home" || route.name === "friends") && "active")}
        title="ZUNO Home — direct messages"
        onClick={() => navigate("/friends")}
      >
        <ZunoMark size={30} />
      </button>

      <div className="rail-sep" />

      <div className="rail-scroll">
        {grouped.unfiled.map((server) => (
          <ServerButton key={server.id} id={server.id} />
        ))}

        {grouped.byFolder.map(({ folder, servers }) => (
          <div
            className="folder-wrap"
            key={folder.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) {
                void moveIntoFolder(dragId, folder.id);
                setDragId(null);
              }
            }}
          >
            <button
              type="button"
              className={cls("folder-btn", openFolders[folder.id] && "open")}
              style={{ ["--folder-color" as string]: folder.color }}
              title={`${folder.name} — ${servers.length} servers`}
              onClick={() => setOpenFolders((prev) => ({ ...prev, [folder.id]: !prev[folder.id] }))}
              onContextMenu={(e) => {
                e.preventDefault();
                setFolderMenu({ folderId: folder.id, x: e.clientX, y: e.clientY });
              }}
            >
              <span className="folder-grid">
                {servers.slice(0, 4).map((s) => (
                  <i key={s.id}>
                    {s.iconId ? <img src={`/api/files/${s.iconId}`} alt="" /> : initials(s.name).slice(0, 1)}
                  </i>
                ))}
              </span>
            </button>
            {openFolders[folder.id] && (
              <div className="folder-children">
                {servers.map((server) => (
                  <ServerButton key={server.id} id={server.id} />
                ))}
              </div>
            )}
          </div>
        ))}

        <button type="button" className="rail-action" title="Add a server" onClick={() => openModal({ type: "createServer" })}>
          <Plus size={22} />
        </button>
        <button type="button" className="rail-action" title="Discover communities" onClick={() => navigate("/discover")}>
          <Compass size={22} />
        </button>
        <button
          type="button"
          className="rail-action"
          title="Create a folder from your servers"
          onClick={() => {
            if (me.servers.length < 2) {
              toast("Join at least two servers to build a folder.", "info");
              return;
            }
            void createFolderFrom(me.servers[1].id, me.servers[0].id);
          }}
        >
          <FolderPlus size={20} />
        </button>
      </div>

      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseLeave={() => setMenu(null)}>
          <div className="context-title">{serverMap.get(menu.serverId)?.name}</div>
          <button
            type="button"
            onClick={() => {
              openModal({ type: "invite", serverId: menu.serverId });
              setMenu(null);
            }}
          >
            <UserPlus size={15} /> Invite people
          </button>
          <button
            type="button"
            onClick={() => {
              navigate(`/channels/${menu.serverId}`);
              openModal({ type: "serverSettings" });
              setMenu(null);
            }}
          >
            <Settings size={15} /> Server settings
          </button>
          <button
            type="button"
            className="danger"
            onClick={async () => {
              const id = menu.serverId;
              setMenu(null);
              try {
                await api(`/api/servers/${id}/leave`, { method: "POST", body: {} });
                toast("You left the server");
                await refreshMe(true);
                if (activeServerId === id) navigate("/");
              } catch (err) {
                toast(err instanceof Error ? err.message : "Could not leave server", "error");
              }
            }}
          >
            <LogOut size={15} /> Leave server
          </button>
        </div>
      )}

      {folderMenu && (
        <div className="context-menu" style={{ left: folderMenu.x, top: folderMenu.y }} onMouseLeave={() => setFolderMenu(null)}>
          <div className="context-title">Folder</div>
          <button
            type="button"
            className="danger"
            onClick={() => void deleteFolder(folderMenu.folderId)}
          >
            <LogOut size={15} /> Delete folder
          </button>
        </div>
      )}
    </nav>
  );
}
