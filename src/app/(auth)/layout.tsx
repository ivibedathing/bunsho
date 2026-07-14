import Image from "next/image";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="grid w-full max-w-sm gap-6">
        <div className="flex items-center justify-center gap-3">
          <Image src="/brand/bunsho-icon.svg" alt="" width={40} height={40} priority />
          <span className="font-display text-2xl font-bold tracking-tight">Bunsho</span>
          <span lang="ja" className="text-sm text-ink-muted">
            文書
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
