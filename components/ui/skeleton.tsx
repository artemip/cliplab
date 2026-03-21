import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md bg-[length:200%_100%] bg-[linear-gradient(90deg,var(--skeleton-base)_0%,var(--skeleton-shimmer)_50%,var(--skeleton-base)_100%)]",
        "animate-[shimmer_1.5s_ease-in-out_infinite]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
