import React, { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, Image as ImageIcon, Paperclip, Send, Smile, Sparkles, X } from "lucide-react";
import { useApp } from "../state";
import { api, uploadFile } from "../lib/api";
import { EMOJI_GROUPS, has, P, STICKERS, bytes, cls } from "../lib/utils";
import { IconButton, StickerArt } from "./ui";

interface AttachmentDraft {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

export function Composer({
  channelId,
  placeholder,
  compact,
  onSent,
}: {
  channelId?: string;
  placeholder?: string;
  compact?: boolean;
  onSent?: () => void;
}) {
  const app = useApp();
  const targetId = channelId ?? app.channel?.id ?? null;
  const isMainChannel = !channelId || channelId === app.channel?.id;
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [sticker, setSticker] = useState<string | null>(null);
  const [gifUrl, setGifUrl] = useState("");
  const [picker, setPicker] = useState<"emoji" | "sticker" | "gif" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const permissions = app.channelPermissions;
  const isDm = app.channel?.type === "dm" || app.channel?.type === "group";
  const canSend = channelId ? true : isDm || has(permissions, P.SEND_MESSAGES);
  const canAttach = channelId ? true : isDm || has(permissions, P.ATTACH_FILES);
  const slowmode = app.channel?.slowmode ?? 0;

  const members = app.server?.members ?? [];
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) => m.username !== app.me.user.username)
      .filter((m) => !q || m.username.toLowerCase().includes(q) || (m.nickname ?? m.displayName).toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, members, app.me.user.username]);

  useEffect(() => {
    setText("");
    setAttachments([]);
    setSticker(null);
    setGifUrl("");
    setPicker(null);
    setMentionQuery(null);
  }, [targetId]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(220, el.scrollHeight)}px`;
  }, [text]);

  useEffect(() => {
    if (!cooldown) return;
    const id = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setPicker(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const handleFiles = async (files: FileList | File[]) => {
    if (!canAttach) {
      app.toast("You do not have permission to attach files here.", "error");
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 4)) {
        if (file.size > 8 * 1024 * 1024) {
          app.toast(`${file.name} is larger than 8 MB.`, "error");
          continue;
        }
        const result = await uploadFile(file, "attachment");
        setAttachments((prev) => [
          ...prev,
          { id: result.file.id, name: result.file.filename, size: result.file.size, type: result.file.contentType, url: result.file.url },
        ]);
      }
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const insertAtCursor = (value: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => prev + value);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + value + text.slice(end);
    setText(next.slice(0, 4000));
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + value.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const updateMentionState = (value: string, cursor: number) => {
    const before = value.slice(0, cursor);
    const match = before.match(/@([a-z0-9_.]*)$/i);
    if (match && members.length) setMentionQuery(match[1]);
    else setMentionQuery(null);
  };

  const pickMention = (username: string) => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? text.length;
    const before = text.slice(0, cursor).replace(/@([a-z0-9_.]*)$/i, `@${username} `);
    setText((before + text.slice(cursor)).slice(0, 4000));
    setMentionQuery(null);
    requestAnimationFrame(() => el?.focus());
  };

  const reset = () => {
    setText("");
    setAttachments([]);
    setSticker(null);
    setGifUrl("");
    setPicker(null);
    setMentionQuery(null);
  };

  const submit = async (override?: { sticker?: string; gifUrl?: string }) => {
    if (sending || cooldown) return;
    const content = text.trim();
    const stickerValue = override?.sticker ?? sticker;
    const gifValue = override?.gifUrl ?? gifUrl.trim();
    if (!content && !attachments.length && !stickerValue && !gifValue) return;
    setSending(true);
    const payload = {
      content,
      attachmentIds: attachments.map((a) => a.id),
      sticker: stickerValue || null,
      gifUrl: gifValue || null,
    };
    try {
      if (isMainChannel) {
        await app.sendMessage(payload);
      } else if (targetId) {
        await api(`/api/channels/${targetId}/messages`, { method: "POST", body: payload });
        await api(`/api/channels/${targetId}/read`, { method: "POST", body: {} }).catch(() => undefined);
      }
      reset();
      if (slowmode > 0) setCooldown(slowmode);
      onSent?.();
      textareaRef.current?.focus();
    } catch (err) {
      app.toast(err instanceof Error ? err.message : "Could not send message", "error");
    } finally {
      setSending(false);
    }
  };

  if (!targetId) return null;

  return (
    <div
      className={cls("composer-shell", compact && "compact")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
      }}
    >
      {app.pendingReply && isMainChannel && (
        <div className="reply-banner">
          <span>
            Replying to <strong>{app.pendingReply.author.displayName}</strong>
          </span>
          <button type="button" onClick={() => app.setPendingReply(null)} aria-label="Cancel reply">
            <X size={14} />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="attachment-drafts">
          {attachments.map((file) => (
            <div className="attachment-chip" key={file.id}>
              {file.type.startsWith("image/") ? (
                <img src={file.url} alt={file.name} />
              ) : (
                <span className="file-icon">FILE</span>
              )}
              <span>
                <strong>{file.name}</strong>
                <small>{bytes(file.size)}</small>
              </span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== file.id))}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {sticker && (
        <div className="sticker-draft">
          <StickerArt name={sticker} size={54} />
          <span>Sticker ready to send</span>
          <button type="button" onClick={() => setSticker(null)} aria-label="Remove sticker">
            <X size={13} />
          </button>
        </div>
      )}

      {gifUrl && (
        <div className="gif-draft">
          <img src={gifUrl} alt="GIF preview" />
          <button type="button" onClick={() => setGifUrl("")} aria-label="Remove GIF">
            <X size={13} />
          </button>
        </div>
      )}

      {dragging && <div className="composer-drop">Drop files to attach</div>}

      <div className="composer-row">
        <div className="composer-toolbar">
          <IconButton label="Attach files" onClick={() => fileRef.current?.click()} disabled={!canAttach || uploading}>
            <Paperclip size={18} />
          </IconButton>
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif,application/pdf,text/plain,.zip,audio/mpeg,video/mp4"
            onChange={(e) => e.target.files && void handleFiles(e.target.files)}
          />
          <IconButton label="Emoji" active={picker === "emoji"} onClick={() => setPicker(picker === "emoji" ? null : "emoji")}>
            <Smile size={18} />
          </IconButton>
          <IconButton label="Stickers" active={picker === "sticker"} onClick={() => setPicker(picker === "sticker" ? null : "sticker")}>
            <Sparkles size={18} />
          </IconButton>
          <IconButton label="GIF" active={picker === "gif"} onClick={() => setPicker(picker === "gif" ? null : "gif")}>
            <ImageIcon size={18} />
          </IconButton>
        </div>

        <div className="composer-input-wrap">
          <textarea
            ref={textareaRef}
            className="composer-input"
            value={text}
            rows={1}
            maxLength={4000}
            disabled={!canSend}
            placeholder={
              canSend
                ? placeholder ?? `Message ${app.channel?.type === "dm" ? "" : "#"}${app.channel?.name ?? ""}`
                : "You do not have permission to send messages in this channel"
            }
            onChange={(e) => {
              setText(e.target.value);
              updateMentionState(e.target.value, e.target.selectionStart ?? e.target.value.length);
              if (e.target.value.trim()) app.submitTyping();
            }}
            onKeyDown={(e) => {
              if (suggestions.length && (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey))) {
                e.preventDefault();
                pickMention(suggestions[0].username);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
              if (e.key === "Escape") setMentionQuery(null);
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (/^https:\/\/(media|i|media0|media1)\.giphy\.com\/.+\.(gif|mp4)/.test(pasted) || /^https:\/\/media\.tenor\.com\//.test(pasted)) {
                e.preventDefault();
                setGifUrl(pasted.trim());
              }
            }}
          />
          {suggestions.length > 0 && (
            <div className="mention-popup">
              {suggestions.map((member) => (
                <button type="button" key={member.id} onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(member.username)}>
                  <AtSign size={13} /> {member.nickname || member.displayName}
                  <small>@{member.username}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="composer-send"
          onClick={() => void submit()}
          disabled={!canSend || sending || cooldown > 0 || (!text.trim() && !attachments.length && !sticker && !gifUrl)}
          aria-label="Send message"
        >
          <Send size={17} />
        </button>
      </div>

      <div className="composer-meta">
        {cooldown > 0 && <span>Slow mode · {cooldown}s</span>}
        {uploading && <span>Uploading…</span>}
        <span className="composer-hint">
          <strong>Enter</strong> to send · <strong>Shift + Enter</strong> for a new line
        </span>
        {text.length > 3600 && <span className={cls(text.length > 3900 && "over")}>{text.length}/4000</span>}
      </div>

      {picker && (
        <div className="composer-picker" ref={pickerRef}>
          {picker === "emoji" && (
            <>
              {EMOJI_GROUPS.map((group) => (
                <div key={group.label} className="emoji-group">
                  <span className="emoji-group-label">{group.label}</span>
                  <div className="emoji-grid">
                    {group.emoji.map((emoji) => (
                      <button
                        type="button"
                        key={`${group.label}-${emoji}`}
                        onClick={() => {
                          insertAtCursor(emoji);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {app.server?.emojis.length ? (
                <div className="emoji-group">
                  <span className="emoji-group-label">{app.server.server.name} emoji</span>
                  <div className="emoji-grid">
                    {app.server.emojis.map((emoji) => (
                      <button
                        type="button"
                        key={emoji.id}
                        title={`:${emoji.name}:`}
                        onClick={() => insertAtCursor(`:${emoji.name}: `)}
                      >
                        <img src={`/api/files/${emoji.file_id}`} alt={emoji.name} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}

          {picker === "sticker" && (
            <>
              <div className="picker-title">ZUNO sticker pack</div>
              <div className="sticker-grid">
                {STICKERS.map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    title={item.label}
                    onClick={() => {
                      setSticker(item.key);
                      setPicker(null);
                    }}
                  >
                    <StickerArt name={item.key} size={64} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {picker === "gif" && (
            <div className="gif-picker">
              <div className="picker-title">Share a GIF</div>
              <p className="picker-hint">
                Paste a Giphy or Tenor GIF link. ZUNO renders it inline for everyone in the conversation.
              </p>
              <input
                value={gifUrl}
                onChange={(e) => setGifUrl(e.target.value)}
                placeholder="https://media.giphy.com/media/…/giphy.gif"
                aria-label="GIF URL"
              />
              {gifUrl && <img className="gif-preview" src={gifUrl} alt="GIF preview" />}
              <div className="gif-actions">
                <span className="picker-hint">Only https GIF links from Giphy or Tenor are accepted by the server.</span>
                <button
                  type="button"
                  className="primary-btn small"
                  disabled={!gifUrl}
                  onClick={() => {
                    setPicker(null);
                    void submit({ gifUrl });
                  }}
                >
                  Send GIF
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
