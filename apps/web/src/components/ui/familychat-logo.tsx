import { cn } from "@/lib/utils/cn";

type FamilyChatLogoProps = {
  className?: string;
  compact?: boolean;
};

export function FamilyChatLogo({ className, compact = false }: FamilyChatLogoProps) {
  return (
    <div
      aria-label="FamilyChat"
      className={cn("select-none text-center font-black leading-none", className)}
    >
      <span
        className={cn(
          "block bg-gradient-to-br from-sky-500 via-cyan-500 to-accent-teal bg-clip-text text-transparent drop-shadow-[0_5px_12px_rgba(56,189,248,0.28)]",
          compact ? "text-[1.35rem]" : "text-[2.7rem]",
        )}
      >
        Family
      </span>
      <span
        className={cn(
          "-mt-0.5 block bg-gradient-to-br from-sky-400 via-cyan-500 to-teal-500 bg-clip-text text-transparent drop-shadow-[0_4px_10px_rgba(14,165,233,0.22)]",
          compact ? "text-[1.2rem]" : "text-[2.35rem]",
        )}
      >
        Chat
      </span>
    </div>
  );
}
