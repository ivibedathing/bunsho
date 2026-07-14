import { LogOut } from "lucide-react";

type UserCardProps = {
  name: string | null;
  email: string;
  role: string;
  signOutAction: () => Promise<void>;
};

export function UserCard({ name, email, role, signOutAction }: UserCardProps) {
  const display = name ?? email;
  const initials = display
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-wash font-mono text-xs font-semibold text-gold">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-medium text-ink">{display}</p>
        <p className="m-0 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-ink-muted">
          {role}
        </p>
      </div>
      <form action={signOutAction}>
        <button
          type="submit"
          title="Sign out"
          className="grid cursor-pointer place-items-center rounded-control border-0 bg-transparent p-2 text-ink-muted transition-colors hover:bg-gold-wash hover:text-ink"
        >
          <LogOut size={16} strokeWidth={1.75} aria-hidden />
          <span className="sr-only">Sign out</span>
        </button>
      </form>
    </div>
  );
}
