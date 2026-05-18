import React from "react";
import logoUrl from "../fhir-logo.png";

export function TopBar() {
  const base = navBase();
  return (
    <header className="spec-topbar">
      <div className="spec-topbar-inner">
        <a href={`${base}index.html`}><img src={logoUrl} alt="HL7 FHIR" /></a>
        <span className="build-tag">R4 → R6 Breaking Changes</span>
        <nav className="top-nav" aria-label="Primary">
          <a href={`${base}index.html`}>Structure</a>
          <a href={`${base}operations`}>Operations</a>
          <a href={`${base}pages`}>Pages/API</a>
        </nav>
        <a
          className="source-link"
          href="https://github.com/jmandel/fhir-r6-changes"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Source code on GitHub"
          title="Source code on GitHub"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M8 0C3.58 0 0 3.67 0 8.19c0 3.62 2.29 6.69 5.47 7.78.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.56-2.01.38-2.53-.5-2.69-.96-.09-.24-.48-.96-.82-1.15-.28-.15-.68-.52-.01-.53.63-.01 1.08.59 1.23.84.72 1.24 1.87.89 2.33.68.07-.53.28-.89.51-1.09-1.78-.21-3.64-.91-3.64-4.04 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.42 7.42 0 0 1 8 3.98c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.14-1.87 3.83-3.65 4.04.29.25.54.75.54 1.52 0 1.1-.01 1.98-.01 2.25 0 .22.15.48.55.4A8.09 8.09 0 0 0 16 8.19C16 3.67 12.42 0 8 0Z" />
          </svg>
        </a>
      </div>
    </header>
  );
}

export function SubNav() {
  return null;
}

export function Crumb({ children }: { children: React.ReactNode }) {
  return (
    <div className="spec-crumb">
      <div className="spec-crumb-inner">{children}</div>
    </div>
  );
}

export function Footer() {
  const base = navBase();
  return (
    <footer className="spec-footer">
      <div className="spec-footer-inner">
        <span className="copy">
          Automated R4→R6 breaking-change analysis. Not affiliated with HL7 or the FHIR ballot. Use alongside the official spec at{" "}
          <a href="https://build.fhir.org/" target="_blank" rel="noopener">build.fhir.org</a>.
        </span>
        <a href={`${base}index.html`}>Structure explorer</a>
        <a href={`${base}operations`}>Operations</a>
        <a href={`${base}pages`}>Pages/API</a>
      </div>
    </footer>
  );
}

function navBase(): string {
  if (typeof location === "undefined") return "./";
  return /\/(?:operations|pages)\/(?:index\.html)?$/.test(location.pathname)
    ? "../"
    : "./";
}
