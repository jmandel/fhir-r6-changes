import React, { useMemo } from "react";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export function Markdown({ source, className }: { source?: string; className?: string }) {
  const html = useMemo(() => (source ? marked.parse(source) as string : ""), [source]);
  if (!source) return null;
  return <div className={`md ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
