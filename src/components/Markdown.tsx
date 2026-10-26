import React, { useMemo } from "react";
import type { ServerEmoji } from "../lib/types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface Props {
  content: string;
  emojis?: ServerEmoji[];
  className?: string;
}

/**
 * Small, safe subset of Discord-style markdown. Input is HTML-escaped before
 * any formatting is applied, so message content can never inject markup.
 */
export function Markdown({ content, emojis = [], className }: Props) {
  const html = useMemo(() => {
    let out = escapeHtml(content);

    out = out.replace(/```([\s\S]+?)```/g, (_m, code) => `<pre class="md-code">${code.trim()}</pre>`);
    out = out.replace(/`([^`\n]+)`/g, '<code class="md-inline">$1</code>');
    out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    out = out.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
    out = out.replace(/__([^_\n]+)__/g, "<u>$1</u>");
    out = out.replace(/\|\|([\s\S]+?)\|\|/g, '<span class="md-spoiler">$1</span>');
    out = out.replace(/> ([^\n]+)/g, '<span class="md-quote">$1</span>');

    out = out.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
      return `<a href="${url}" target="_blank" rel="noreferrer noopener">${url}</a>`;
    });

    for (const emoji of emojis) {
      const token = `:${emoji.name}:`;
      if (!out.includes(token)) continue;
      out = out.split(token).join(`<img class="md-emoji" src="/api/files/${emoji.file_id}" alt=":${emoji.name}:" title=":${emoji.name}:" />`);
    }

    out = out.replace(
      /(^|[\s(])@([a-zA-Z0-9_.]{3,20})/g,
      (_m, lead, name) => `${lead}<span class="md-mention">@${name}</span>`,
    );
    out = out.replace(
      /(^|[\s(])#([a-z0-9-_]{1,60})/g,
      (_m, lead, name) => `${lead}<span class="md-channel">#${name}</span>`,
    );
    out = out.replace(/\n/g, "<br/>");
    return out;
  }, [content, emojis]);

  return <div className={className ?? "md"} dangerouslySetInnerHTML={{ __html: html }} />;
}
