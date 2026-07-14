"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** The publish celebration: a gold seal stamps the screen once, then the
 *  `?published=` param is stripped so refresh/back never replays it. */
export function SealStamp({ version }: { version: string }) {
  const [visible, setVisible] = useState(true);
  const reduce = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();
  const stripped = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), reduce ? 2600 : 2000);
    return () => clearTimeout(t);
  }, [reduce]);

  useEffect(() => {
    if (!stripped.current) {
      stripped.current = true;
      router.replace(pathname, { scroll: false });
    }
  }, [pathname, router]);

  return (
    <AnimatePresence>
      {visible &&
        (reduce ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-live="polite"
            className="fixed inset-x-0 bottom-8 z-50 mx-auto w-fit rounded-card border border-gold/50 bg-carbon-raised px-5 py-3 font-mono text-sm text-gold shadow-lg"
          >
            Published v{version}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.35 } }}
            onClick={() => setVisible(false)}
            aria-live="polite"
            className="fixed inset-0 z-50 grid cursor-pointer place-items-center bg-carbon/70 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ scale: 1.9, opacity: 0, rotate: -16 }}
              animate={{ scale: 1, opacity: 1, rotate: -6 }}
              transition={{ type: "spring", stiffness: 480, damping: 24, mass: 0.9 }}
              className="grid place-items-center gap-1 rounded-xl border-4 border-gold px-8 py-6 text-gold shadow-[0_0_60px_rgba(217,190,130,0.25)]"
            >
              <span className="font-mono text-[0.6875rem] uppercase tracking-[0.3em]">
                Published
              </span>
              <span className="font-display text-4xl font-extrabold tabular-nums">v{version}</span>
              <span lang="ja" className="text-xs text-gold/70">
                文書
              </span>
            </motion.div>
          </motion.div>
        ))}
    </AnimatePresence>
  );
}
