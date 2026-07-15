import { describe, expect, it } from "vitest";
import {
  type CanonicalAuditRow,
  canonicalize,
  computeEntryHash,
  type StoredAuditEntry,
  verifyChain,
} from "./hashChain";

const baseRow = (over: Partial<CanonicalAuditRow> = {}): CanonicalAuditRow => ({
  orgId: "org1",
  action: "document_published",
  actorType: "user",
  actorId: "u1",
  targetType: "document_version",
  targetId: "v1",
  metadata: { version: 1 },
  createdAt: "2026-07-14T12:00:00.000Z",
  ...over,
});

/** Build an intact chain from rows, linking each hash to the previous. */
function buildChain(rows: CanonicalAuditRow[]): StoredAuditEntry[] {
  let prevHash: string | null = null;
  return rows.map((row, i) => {
    const hash = computeEntryHash(prevHash, row);
    const entry: StoredAuditEntry = { ...row, seq: BigInt(i + 1), prevHash, hash };
    prevHash = hash;
    return entry;
  });
}

describe("canonicalize", () => {
  it("is independent of key insertion order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    expect(canonicalize({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it("sorts keys recursively but preserves array order", () => {
    expect(canonicalize({ z: { y: 1, x: 2 }, a: [3, 1, 2] })).toBe(
      '{"a":[3,1,2],"z":{"x":2,"y":1}}',
    );
  });

  it("handles null and nested nulls", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize({ a: null })).toBe('{"a":null}');
  });

  it("drops undefined so DB round-trips match", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("computeEntryHash", () => {
  it("is deterministic", () => {
    expect(computeEntryHash(null, baseRow())).toBe(computeEntryHash(null, baseRow()));
  });

  it("changes when any field changes", () => {
    const h = computeEntryHash(null, baseRow());
    expect(computeEntryHash(null, baseRow({ targetId: "v2" }))).not.toBe(h);
    expect(computeEntryHash(null, baseRow({ metadata: { version: 2 } }))).not.toBe(h);
    expect(computeEntryHash(null, baseRow({ createdAt: "2026-07-14T12:00:01.000Z" }))).not.toBe(h);
  });

  it("changes when the previous hash changes (the chain linkage)", () => {
    expect(computeEntryHash("aaaa", baseRow())).not.toBe(computeEntryHash("bbbb", baseRow()));
  });

  it("produces a sha256 hex digest", () => {
    expect(computeEntryHash(null, baseRow())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyChain", () => {
  it("accepts an empty chain", () => {
    expect(verifyChain([])).toEqual({ ok: true, count: 0 });
  });

  it("accepts an intact chain", () => {
    const chain = buildChain([baseRow(), baseRow({ action: "document_retired" }), baseRow()]);
    expect(verifyChain(chain)).toEqual({ ok: true, count: 3 });
  });

  it("detects a tampered payload", () => {
    const chain = buildChain([baseRow(), baseRow(), baseRow()]);
    // Mutate a historical row's content without recomputing its hash.
    chain[1] = { ...chain[1]!, metadata: { version: 999 } };
    const res = verifyChain(chain);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.brokenAtSeq).toBe(2n);
  });

  it("detects a broken prevHash link (reordering / deletion)", () => {
    const chain = buildChain([baseRow(), baseRow(), baseRow()]);
    // Drop the middle entry: entry 3's prevHash no longer matches entry 1's hash.
    const tampered = [chain[0]!, chain[2]!];
    const res = verifyChain(tampered);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("prevHash mismatch");
  });

  it("detects a forged hash", () => {
    const chain = buildChain([baseRow()]);
    chain[0] = { ...chain[0]!, hash: "0".repeat(64) };
    const res = verifyChain(chain);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("hash mismatch");
  });
});
