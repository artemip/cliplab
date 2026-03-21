import Link from "next/link";
import { Mic } from "lucide-react";
import { cn } from "@/lib/cn";

const accentButtonClass =
  "inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] min-h-[44px] px-4 py-3 text-sm font-medium text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]";

export default function FeedPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-balance">ClipLab</h1>
          <p className="mt-1 text-[var(--text-secondary)]">
            Record, filter, and share audio clips
          </p>
        </div>
        <Link href="/record" className={accentButtonClass}>
          <Mic className="h-4 w-4" aria-hidden="true" />
          Record
        </Link>
      </header>

      {/* Empty state — will be replaced with clip list */}
      <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] px-8 py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-surface)]">
          <Mic className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-medium">No clips yet</h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--text-secondary)]">
          Record your first audio clip, apply filters, and share it with the
          world.
        </p>
        <Link href="/record" className={cn("mt-6", accentButtonClass)}>
          <Mic className="h-4 w-4" aria-hidden="true" />
          Record your first clip
        </Link>
      </div>
    </main>
  );
}
