import { NextResponse } from "next/server";

// Lightweight liveness endpoint for container health checks and load balancers.
// Does not touch the database — readiness (DB reachable) lands with M1.
export function GET() {
  return NextResponse.json({ status: "ok", service: "bunsho" });
}
