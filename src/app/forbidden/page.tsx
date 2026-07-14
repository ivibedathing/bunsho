import { authCard, authTitle } from "@/app/auth-ui";
import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main style={authCard}>
      <h1 style={authTitle}>Not allowed</h1>
      <p style={{ color: "var(--muted)", margin: 0 }}>
        Your role doesn’t have access to that page.
      </p>
      <Link href="/" style={{ color: "inherit" }}>
        ← Back home
      </Link>
    </main>
  );
}
