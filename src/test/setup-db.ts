import { prisma } from "@/lib/db";
import { afterAll, beforeEach } from "vitest";
import { resetDb } from "./db";

/**
 * Every integration test starts from an empty database. TRUNCATE (not DELETE)
 * matters here: `audit_log` and the evidence tables carry BEFORE DELETE triggers
 * that reject row deletion, and TRUNCATE does not fire row-level triggers — so
 * the write-once guarantee stays armed for the tests that assert it.
 */
beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});
