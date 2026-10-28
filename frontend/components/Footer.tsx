"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="cs-footer">
      <div className="cs-footer-inner">
        <div className="cs-footer-copy">
          <strong>ConceptScape</strong> &copy; {new Date().getFullYear()}. Verifiable, evidence-grounded concept knowledge graph engine. Built for rigorous academic and scientific exploration.
        </div>

        <div className="cs-footer-bottom-right">
          <div className="cs-footer-bottom-links">
            <Link href="/graph">Graph</Link>
            <span>•</span>
            <Link href="/chat">Ask</Link>
            <span>•</span>
            <Link href="/workspace">Workspace</Link>
            <span>•</span>
            <Link href="/upload">Upload</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
