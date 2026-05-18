import React from "react";
import logoUrl from "../fhir-logo.png";

export function TopBar() {
  return (
    <header className="spec-topbar">
      <div className="spec-topbar-inner">
        <a href="#/"><img src={logoUrl} alt="HL7 FHIR" /></a>
        <span className="build-tag">R4 → R6 Breaking Changes</span>
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
  return (
    <footer className="spec-footer">
      <div className="spec-footer-inner">
        <span className="copy">
          Automated R4→R6 breaking-change analysis. Not affiliated with HL7 or the FHIR ballot. Use alongside the official spec at{" "}
          <a href="https://build.fhir.org/" target="_blank" rel="noopener">build.fhir.org</a>.
        </span>
        <a href="#/">Explorer</a>
      </div>
    </footer>
  );
}
