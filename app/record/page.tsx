"use client";

import Link from "next/link";
import { ArrowLeft, Mic } from "lucide-react";

export default function RecordPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/"
        className="mb-6 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to clips
      </Link>

      <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] px-8 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-surface)]">
          <Mic className="h-7 w-7 text-[var(--accent)]" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-balance">
          Record something
        </h1>
        <p className="mt-2 max-w-sm text-sm text-[var(--text-secondary)]">
          Capture a vocal take, layer effects like reverb and delay, and share
          it with the world.
        </p>
      </div>
    </main>
  );
}
