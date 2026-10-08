import { cn } from "@/lib/utils/cn";

import { avatarSrcById } from "./avatar-options";

type AvatarProps = {
  name: string;
  avatarId?: string;
  className?: string;
};

const palettes = [
  "from-sky-200 via-cyan-100 to-white ring-sky-200/70",
  "from-rose-200 via-orange-100 to-white ring-rose-200/70",
  "from-violet-200 via-sky-100 to-white ring-violet-200/70",
  "from-emerald-200 via-teal-100 to-white ring-emerald-200/70",
  "from-amber-200 via-yellow-100 to-white ring-amber-200/70",
];

function hashName(name: string) {
  return Array.from(name || "FamilyChat").reduce(
    (hash, char) => (hash * 33 + char.charCodeAt(0)) % 9973,
    7,
  );
}

export function Avatar({ avatarId, className, name }: AvatarProps) {
  const hash = hashName(name);
  const palette = palettes[hash % palettes.length];
  const hairOffset = hash % 2 === 0 ? "left-2" : "right-2";
  const avatarSrc = avatarSrcById(avatarId);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br shadow-sm ring-1",
        palette,
        className,
      )}
    >
      {avatarId === "family" ? (
        <span className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-400 via-cyan-300 to-white">
          <span className="absolute bottom-1.5 left-1.5 h-4 w-4 rounded-full bg-white/94 shadow-sm" />
          <span className="absolute bottom-1.5 right-1.5 h-4 w-4 rounded-full bg-white/94 shadow-sm" />
          <span className="absolute bottom-2 h-5 w-5 rounded-full bg-white shadow-md" />
          <span className="absolute top-2 h-3 w-6 rounded-full bg-white/80 blur-[1px]" />
          <span className="relative text-[0.72rem] font-black text-sky-600">FC</span>
        </span>
      ) : avatarSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" src={avatarSrc} />
      ) : (
        <>
          <span
            className={cn(
              "absolute top-1 h-4 w-6 rounded-full bg-slate-700/80 blur-[0.2px]",
              hairOffset,
            )}
          />
          <span className="relative mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/92 shadow-inner">
            <span className="absolute left-2 top-2 h-1 w-1 rounded-full bg-slate-700" />
            <span className="absolute right-2 top-2 h-1 w-1 rounded-full bg-slate-700" />
            <span className="absolute bottom-2 h-1 w-3 rounded-full border-b border-slate-700/80" />
          </span>
        </>
      )}
    </span>
  );
}
