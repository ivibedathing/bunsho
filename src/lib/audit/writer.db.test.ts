import { computeEntryHash, verifyChain } from "@/lib/audit/hashChain";
import { type AppendAuditInput, appendAudit, loadChain, verifyOrgChain } from "@/lib/audit/writer";
import { prisma } from "@/lib/db";
import { makeOrg, makeOrgWithAdmin } from "@/test/db";
import { describe, expect, it } from "vitest";

/** appendAudit takes a per-org advisory lock, so it only runs inside a transaction. */
function append(input: AppendAuditInput) {
  return prisma.$transaction((tx) => appendAudit(tx, input));
}

function entry(orgId: string, overrides: Partial<AppendAuditInput> = {}): AppendAuditInput {
  return {
    orgId,
    action: "document_created",
    actorType: "user",
    targetType: "document",
    ...overrides,
  };
}

describe("appendAudit", () => {
  it("starts an org's chain with a genesis entry whose prevHash is null", async () => {
    const org = await makeOrg();
    const created = await append(entry(org.id));

    const genesis = (await loadChain(prisma, org.id))[0]!;
    expect(genesis.prevHash).toBeNull();
    expect(genesis.hash).toBe(created.hash);
    expect(genesis.seq).toBe(created.seq);
  });

  it("links each entry's prevHash to the hash of the one before it", async () => {
    const org = await makeOrg();
    const first = await append(entry(org.id, { action: "document_created" }));
    const second = await append(entry(org.id, { action: "document_published" }));
    const third = await append(entry(org.id, { action: "document_retired" }));

    const chain = await loadChain(prisma, org.id);
    expect(chain.map((e) => e.prevHash)).toEqual([null, first.hash, second.hash]);
    expect(chain.map((e) => e.hash)).toEqual([first.hash, second.hash, third.hash]);
  });

  it("stores a hash that commits to prevHash plus the canonical row content", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await append(
      entry(org.id, {
        action: "settings_changed",
        actorId: admin.id,
        targetType: "settings",
        targetId: "cfg-1",
        metadata: { retentionDays: 30 },
      }),
    );

    const stored = (await loadChain(prisma, org.id))[0]!;
    // Recompute from the row as it came back off disk — this is what a verifier does.
    expect(stored.hash).toBe(
      computeEntryHash(stored.prevHash, {
        orgId: stored.orgId,
        action: stored.action,
        actorType: stored.actorType,
        actorId: stored.actorId,
        targetType: stored.targetType,
        targetId: stored.targetId,
        metadata: stored.metadata,
        createdAt: stored.createdAt,
      }),
    );
  });

  it("defaults absent actorId, targetId and metadata to null", async () => {
    const org = await makeOrg();
    await append({
      orgId: org.id,
      action: "settings_changed",
      actorType: "system",
      targetType: "settings",
    });

    const stored = (await loadChain(prisma, org.id))[0]!;
    expect(stored.actorId).toBeNull();
    expect(stored.targetId).toBeNull();
    // Written as SQL NULL (DbNull) rather than JSON null, so it reads back as JS null.
    expect(stored.metadata).toBeNull();
  });

  it("round-trips metadata through the JSON column unchanged", async () => {
    const org = await makeOrg();
    const metadata = { restoredFromVersion: 1, tags: ["a", "b"], nested: { ok: true } };
    await append(entry(org.id, { action: "document_restored", metadata }));

    const stored = (await loadChain(prisma, org.id))[0]!;
    expect(stored.metadata).toEqual(metadata);
    await expect(verifyOrgChain(prisma, org.id)).resolves.toMatchObject({ ok: true });
  });

  it("returns seq as a bigint assigned by the database", async () => {
    const org = await makeOrg();
    const first = await append(entry(org.id));
    const second = await append(entry(org.id));

    expect(typeof first.seq).toBe("bigint");
    expect(second.seq).toBeGreaterThan(first.seq);
  });

  it("keeps one org's chain independent of another's when appends interleave", async () => {
    const a = await makeOrg("Org A");
    const b = await makeOrg("Org B");

    const a1 = await append(entry(a.id, { action: "document_created" }));
    const b1 = await append(entry(b.id, { action: "document_created" }));
    const a2 = await append(entry(a.id, { action: "document_published" }));
    const b2 = await append(entry(b.id, { action: "document_published" }));

    const chainA = await loadChain(prisma, a.id);
    const chainB = await loadChain(prisma, b.id);

    // Each org's genesis is its own; B's first entry does not chain off A's.
    expect(chainA.map((e) => e.prevHash)).toEqual([null, a1.hash]);
    expect(chainB.map((e) => e.prevHash)).toEqual([null, b1.hash]);
    expect(chainA.map((e) => e.hash)).toEqual([a1.hash, a2.hash]);
    expect(chainB.map((e) => e.hash)).toEqual([b1.hash, b2.hash]);

    await expect(verifyOrgChain(prisma, a.id)).resolves.toMatchObject({ ok: true, count: 2 });
    await expect(verifyOrgChain(prisma, b.id)).resolves.toMatchObject({ ok: true, count: 2 });
  });
});

describe("loadChain", () => {
  it("returns only the requested org's entries, in seq order", async () => {
    const a = await makeOrg("Org A");
    const b = await makeOrg("Org B");
    await append(entry(a.id, { action: "document_created" }));
    await append(entry(b.id, { action: "user_created", targetType: "user" }));
    await append(entry(a.id, { action: "document_published" }));
    await append(entry(a.id, { action: "document_retired" }));

    const chain = await loadChain(prisma, a.id);
    expect(chain.map((e) => e.action)).toEqual([
      "document_created",
      "document_published",
      "document_retired",
    ]);
    expect(chain.every((e) => e.orgId === a.id)).toBe(true);

    const seqs = chain.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
  });

  it("maps createdAt to the ISO string the hash was computed over", async () => {
    const org = await makeOrg();
    await append(entry(org.id));

    const row = await prisma.auditLogEntry.findFirstOrThrow({ where: { orgId: org.id } });
    const loaded = (await loadChain(prisma, org.id))[0]!;
    expect(loaded.createdAt).toBe(row.createdAt.toISOString());
  });

  it("returns an empty array for an org with no entries", async () => {
    const org = await makeOrg();
    expect(await loadChain(prisma, org.id)).toEqual([]);
  });
});

describe("verifyOrgChain", () => {
  it("verifies a long intact chain", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    for (let i = 0; i < 10; i++) {
      await append(
        entry(org.id, {
          action: i % 2 === 0 ? "document_created" : "document_edited",
          actorId: admin.id,
          targetId: `doc-${i}`,
          // Alternate present/absent metadata: both encodings must verify.
          metadata: i % 3 === 0 ? undefined : { step: i },
        }),
      );
    }

    await expect(verifyOrgChain(prisma, org.id)).resolves.toEqual({ ok: true, count: 10 });
  });

  it("is ok for an empty chain", async () => {
    const org = await makeOrg();
    await expect(verifyOrgChain(prisma, org.id)).resolves.toEqual({ ok: true, count: 0 });
  });

  it("ignores entries belonging to other orgs", async () => {
    const a = await makeOrg("Org A");
    const b = await makeOrg("Org B");
    await append(entry(b.id));

    await expect(verifyOrgChain(prisma, a.id)).resolves.toEqual({ ok: true, count: 0 });
  });
});

describe("audit_log is append-only (DB trigger)", () => {
  it("rejects an UPDATE of a stored entry", async () => {
    const org = await makeOrg();
    const { seq } = await append(entry(org.id, { action: "document_created" }));

    // The trigger raises ERRCODE restrict_violation, which Prisma does not
    // recognize — so the trigger's own message reaches the client.
    await expect(
      prisma.auditLogEntry.update({ where: { seq }, data: { action: "document_deleted" } }),
    ).rejects.toThrow(/Row is write-once/);

    const after = (await loadChain(prisma, org.id))[0]!;
    expect(after.action).toBe("document_created");
  });

  it("rejects an UPDATE issued as raw SQL, not just through Prisma", async () => {
    const org = await makeOrg();
    await append(entry(org.id));

    await expect(
      prisma.$executeRaw`UPDATE "audit_log" SET "hash" = 'forged' WHERE "orgId" = ${org.id}`,
    ).rejects.toThrow(/Row is write-once/);
    await expect(verifyOrgChain(prisma, org.id)).resolves.toMatchObject({ ok: true, count: 1 });
  });

  it("rejects a DELETE of a stored entry", async () => {
    const org = await makeOrg();
    const { seq } = await append(entry(org.id));

    await expect(prisma.auditLogEntry.delete({ where: { seq } })).rejects.toThrow(
      /Row is write-once/,
    );
    expect(await prisma.auditLogEntry.count({ where: { orgId: org.id } })).toBe(1);
  });

  it("rejects deleting a middle entry, which would otherwise orphan the links after it", async () => {
    const org = await makeOrg();
    await append(entry(org.id, { action: "document_created" }));
    const middle = await append(entry(org.id, { action: "document_published" }));
    await append(entry(org.id, { action: "document_retired" }));

    await expect(
      prisma.$executeRaw`DELETE FROM "audit_log" WHERE "seq" = ${middle.seq}`,
    ).rejects.toThrow(/Row is write-once/);
    await expect(verifyOrgChain(prisma, org.id)).resolves.toMatchObject({ ok: true, count: 3 });
  });
});

describe("tamper detection on a real chain", () => {
  /**
   * The DB refuses to mutate audit_log at all, so a tampered chain cannot be
   * produced in place. These tests take a chain that really was written by
   * appendAudit, doctor it after load, and confirm verifyChain catches what a
   * dump-edit-restore attack would have to change.
   */

  it("catches an edited field: the stored hash no longer matches the row", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await append(entry(org.id, { action: "document_created", actorId: admin.id }));
    const target = await append(entry(org.id, { action: "document_published", actorId: admin.id }));
    await append(entry(org.id, { action: "document_retired", actorId: admin.id }));

    const chain = await loadChain(prisma, org.id);
    const doctored = chain.map((e) =>
      e.seq === target.seq ? { ...e, action: "user_created" } : e,
    );

    expect(verifyChain(doctored)).toMatchObject({
      ok: false,
      count: 3,
      brokenAtSeq: target.seq,
      reason: expect.stringContaining("hash mismatch"),
    });
  });

  it("catches a rewritten timestamp, even though nothing else changed", async () => {
    const org = await makeOrg();
    const only = await append(entry(org.id));

    const chain = await loadChain(prisma, org.id);
    const doctored = [{ ...chain[0]!, createdAt: new Date(0).toISOString() }];

    expect(verifyChain(doctored)).toMatchObject({ ok: false, brokenAtSeq: only.seq });
  });

  it("catches reordered entries via the prevHash linkage", async () => {
    const org = await makeOrg();
    await append(entry(org.id, { action: "document_created" }));
    const second = await append(entry(org.id, { action: "document_published" }));
    await append(entry(org.id, { action: "document_retired" }));

    const chain = await loadChain(prisma, org.id);
    const reordered = [chain[1]!, chain[0]!, chain[2]!];

    // Every hash is individually valid; only the linkage exposes the swap.
    expect(verifyChain(reordered)).toMatchObject({
      ok: false,
      brokenAtSeq: second.seq,
      reason: expect.stringContaining("prevHash mismatch"),
    });
  });

  it("catches a dropped entry", async () => {
    const org = await makeOrg();
    await append(entry(org.id, { action: "document_created" }));
    await append(entry(org.id, { action: "document_published" }));
    const last = await append(entry(org.id, { action: "document_retired" }));

    const chain = await loadChain(prisma, org.id);
    const truncated = [chain[0]!, chain[2]!];

    expect(verifyChain(truncated)).toMatchObject({
      ok: false,
      count: 2,
      brokenAtSeq: last.seq,
      reason: expect.stringContaining("prevHash mismatch"),
    });
  });

  it("catches an entry spliced in from another org's chain", async () => {
    const a = await makeOrg("Org A");
    const b = await makeOrg("Org B");
    await append(entry(a.id, { action: "document_created" }));
    const foreign = await append(entry(b.id, { action: "document_created" }));

    const chainA = await loadChain(prisma, a.id);
    const chainB = await loadChain(prisma, b.id);
    const spliced = [...chainA, chainB[0]!];

    expect(verifyChain(spliced)).toMatchObject({ ok: false, brokenAtSeq: foreign.seq });
  });
});
