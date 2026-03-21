"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function RecordPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to clips
      </Link>
      <h1 className="text-2xl font-semibold text-balance">Record a clip</h1>
      <p className="mt-2 text-[var(--text-secondary)]">
        Recording studio — coming in PR 4
      </p>
    </main>
  );
}
