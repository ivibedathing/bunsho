import Image from "next/image";
import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 no-underline">
      <Image src="/brand/bunsho-icon.svg" alt="" width={28} height={28} priority />
      <span className="font-display text-lg font-bold tracking-tight text-ink">Bunsho</span>
      <span lang="ja" className="text-xs text-ink-muted">
        文書
      </span>
    </Link>
  );
}
