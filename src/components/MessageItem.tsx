import React, { useRef, useState } from "react";
import {
  Flag,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  Reply,
  Smile,
  Trash2,
} from "lucide-react";
import type { Message } from "../lib/types";
import { useApp } from "../state";
import { cls, formatTime, has, P, QUICK_EMOJI, bytes } from "../lib/utils";
import { plateClass } from "../lib/nameplates";
import { PlateArt } from "./PlateArt";
import { Avatar, BadgeRow, IconButton, StickerArt, Verified } from "./ui";
import { Markdown } from "./Markdown";

interface Props {
  message: Message;
  grouped: boolean;
  roleColor?: string | null;
  highlighted?: boolean;
}

export function MessageItem({ message, grouped, roleColor, highlighted }: Props) {
  const app = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const editRef = useRef<HTMLTextAreaElement | null>(null);

  const mine = message.author.id === app.me.user.id;
  const perms = app.channelPermissions;
  const canManage = has(perms, P.MANAGE_MESSAGES);
  const canPin = canManage;
  const canDelete = mine || canManage;
  const canReact = has(perms, P.ADD_REACTIONS) || app.channel?.type === "dm";
  const isServerChannel = !!app.server && !!app.channel?.server_id;
  const mentionsMe =
    message.content.includes(`@${app.me.user.username}`) ||
    (message.content.includes("@everyone") && !mine);

  if (message.system) {
    return (
      <div className="system-message">
        <Markdown content={message.content.replace(/<@([a-zA-Z0-9_-]+)>/g, "a member")} />
      </div>
    );
  }

  if (message.deleted) {
    return (
      <div className={cls("message", grouped && "grouped", "deleted")}>
        <div className="message-gutter" />
        <div className="message-body">
          <span className="deleted-note">This message was deleted.</span>
        </div>
      </div>
    );
  }

  const saveEdit = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await app.editMessage(message.id, draft.trim());
      setEditing(false);
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Could not edit message", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this message? This cannot be undone.")) return;
    try {
      await app.deleteMessage(message.id);
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Could not delete message", "error");
    }
  };

  return (
    <article
      className={cls("message", grouped && "grouped", mentionsMe && "mentioned", highlighted && "jump-target")}
      data-message-id={message.id}
      onDoubleClick={() => {
        if (canReact) void app.toggleReaction(message.id, "💙", message.reactions.some((r) => r.emoji === "💙" && r.me));
      }}
    >
      <div className="message-gutter">
        {!grouped ? (
          <Avatar user={message.author} size={40} onClick={() => void app.openProfile(message.author.id)} />
        ) : (
          <span className="hover-time">{formatTime(message.createdAt)}</span>
        )}
      </div>

      <div className="message-body">
        {message.replyTo && (
          <button
            type="button"
            className="reply-reference"
            onClick={() => {
              const el = document.querySelector(`[data-message-id="${message.replyTo!.id}"]`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            <Reply size={12} />
            <strong>{message.replyTo.authorName}</strong>
            <span>{message.replyTo.preview}</span>
          </button>
        )}

        {!grouped && (
          <div className="message-head">
            <button
              type="button"
              className={cls("message-author", "plate-name", plateClass(message.author.nameplate))}
              style={roleColor ? { color: roleColor } : undefined}
              onClick={() => void app.openProfile(message.author.id)}
            >
              <PlateArt id={message.author.nameplate} />
              <span className="plate-label">{message.author.displayName}</span>
            </button>
            {message.author.isOwner && <Verified />}
            <BadgeRow badges={message.author.badges} max={3} compact />
            <time dateTime={new Date(message.createdAt).toISOString()}>{formatTime(message.createdAt)}</time>
            {message.pinned && (
              <span className="pinned-tag">
                <Pin size={10} /> pinned
              </span>
            )}
          </div>
        )}

        {editing ? (
          <div className="edit-box">
            <textarea
              ref={editRef}
              value={draft}
              autoFocus
              rows={Math.min(6, draft.split("\n").length + 1)}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                }
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <div className="edit-actions">
              <span>escape to cancel · enter to save</span>
              <button type="button" className="ghost-btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="button" className="primary-btn small" disabled={saving} onClick={() => void saveEdit()}>
                Save
              </button>
            </div>
          </div>
        ) : (
          message.content && (
            <Markdown
              content={message.content}
              emojis={app.server?.emojis}
              className={cls("md", message.content.length > 120 && !message.content.includes("\n") && "long")}
            />
          )
        )}

        {message.sticker && (
          <div className="message-sticker">
            <StickerArt name={message.sticker} size={128} />
          </div>
        )}

        {message.gifUrl && (
          <div className="message-gif">
            <img src={message.gifUrl} alt="GIF" loading="lazy" />
          </div>
        )}

        {message.attachments.length > 0 && (
          <div className="message-attachments">
            {message.attachments.map((file) => {
              const isImage = file.contentType.startsWith("image/");
              return (
                <a
                  key={file.fileId}
                  className={cls("attachment", isImage && "image")}
                  href={`/api/files/${file.fileId}${isImage ? "" : "?download=1"}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {isImage ? (
                    <img src={`/api/files/${file.fileId}`} alt={file.filename} loading="lazy" />
                  ) : (
                    <>
                      <span className="attachment-badge">FILE</span>
                      <span className="attachment-name">{file.filename}</span>
                      <span className="attachment-size">{bytes(file.size)}</span>
                    </>
                  )}
                </a>
              );
            })}
          </div>
        )}

        {message.reactions.length > 0 && (
          <div className="reaction-row">
            {message.reactions.map((reaction) => (
              <button
                type="button"
                key={reaction.emoji}
                className={cls("reaction", reaction.me && "mine")}
                title={`${reaction.count} reaction${reaction.count === 1 ? "" : "s"}`}
                onClick={() => void app.toggleReaction(message.id, reaction.emoji, reaction.me)}
              >
                <span>{reaction.emoji}</span>
                <strong>{reaction.count}</strong>
              </button>
            ))}
            {canReact && (
              <button type="button" className="reaction add" onClick={() => setShowEmoji((v) => !v)} aria-label="Add reaction">
                <Smile size={13} />
              </button>
            )}
            {showEmoji && (
              <div className="reaction-picker" onMouseLeave={() => setShowEmoji(false)}>
                {QUICK_EMOJI.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    onClick={() => {
                      void app.toggleReaction(message.id, emoji, message.reactions.some((r) => r.emoji === emoji && r.me));
                      setShowEmoji(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {message.thread && (
          <button
            type="button"
            className="thread-link"
            onClick={() => app.setPanel({ type: "thread", channelId: message.thread!.id, messageId: message.id, name: "Thread" })}
          >
            <MessageSquare size={13} />
            <span>{message.thread.replies > 0 ? `${message.thread.replies} replies` : "View thread"}</span>
            <span className="thread-time">{message.thread.lastActivity ? formatTime(message.thread.lastActivity) : ""}</span>
          </button>
        )}

        {message.editedAt && !editing && <span className="edited-tag">(edited)</span>}
      </div>

      <div className="message-actions">
        {canReact && (
          <IconButton label="Add reaction" onClick={() => setShowEmoji((v) => !v)}>
            <Smile size={15} />
          </IconButton>
        )}
        <IconButton label="Reply" onClick={() => app.setPendingReply(message)}>
          <Reply size={15} />
        </IconButton>
        {isServerChannel && (
          <IconButton label="Create thread" onClick={() => void app.openThread(message)}>
            <MessageSquare size={15} />
          </IconButton>
        )}
        <IconButton
          label="Copy message link"
          onClick={async () => {
            const link = app.server
              ? `${window.location.origin}/channels/${app.server.server.id}/${message.channelId}#${message.id}`
              : `${window.location.origin}/dm/${message.channelId}#${message.id}`;
            try {
              await navigator.clipboard.writeText(link);
              app.toast("Message link copied", "success");
            } catch {
              app.toast("Could not copy the link", "error");
            }
          }}
        >
          <Link2 size={15} />
        </IconButton>
        <IconButton label="More" active={showMenu} onClick={() => setShowMenu((v) => !v)}>
          <MoreHorizontal size={15} />
        </IconButton>
        {showMenu && (
          <div className="message-menu" onMouseLeave={() => setShowMenu(false)}>
            {canPin && (
              <button
                type="button"
                onClick={() => {
                  void app.togglePin(message.id, message.pinned);
                  setShowMenu(false);
                }}
              >
                <Pin size={14} /> {message.pinned ? "Unpin message" : "Pin message"}
              </button>
            )}
            {mine && (
              <button
                type="button"
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                  setShowMenu(false);
                  requestAnimationFrame(() => editRef.current?.focus());
                }}
              >
                <Pencil size={14} /> Edit message
              </button>
            )}
            {isServerChannel && (
              <button
                type="button"
                onClick={() => {
                  void app.openThread(message);
                  setShowMenu(false);
                }}
              >
                <MessageSquare size={14} /> Create thread
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                app.openModal({
                  type: "report",
                  targetUserId: message.author.id,
                  messageId: message.id,
                  serverId: app.server?.server.id,
                });
                setShowMenu(false);
              }}
            >
              <Flag size={14} /> Report message
            </button>
            {canDelete && (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  void remove();
                  setShowMenu(false);
                }}
              >
                <Trash2 size={14} /> Delete message
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function TypingIndicator() {
  const { typingUsers } = useApp();
  if (!typingUsers.length) return null;
  const names = typingUsers.map((t) => t.name);
  return (
    <div className="typing-indicator">
      <span className="typing-dots">
        <i />
        <i />
        <i />
      </span>
      <strong>{names.slice(0, 3).join(", ")}</strong>
      {names.length === 1 ? " is typing…" : " are typing…"}
    </div>
  );
}

