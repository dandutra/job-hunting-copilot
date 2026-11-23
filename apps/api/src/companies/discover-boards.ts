import { PrismaService } from "../prisma/prisma.service";
import { boardFromUrl, boardKey } from "./board-from-url";

export interface DiscoverCounts {
  found: number;
  processed: number;
  skipped: number;
  failed: number;
}

// A Company with no board gets the one its oldest Sighting's apply link names, unless another Company holds that pair. See the "Boards are found, not only curated" decision.
export async function discoverBoards(
  prisma: PrismaService,
  log: (line: string) => void = () => undefined,
): Promise<DiscoverCounts> {
  const counts: DiscoverCounts = {
    found: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
  };

  // Compared by boardKey, because two spellings of one board, or two sites of one Workday tenant, would read the same jobs twice.
  const held = new Map<string, string>();
  const holders = await prisma.company.findMany({
    where: { ats: { not: null }, boardSlug: { not: null } },
    select: { name: true, ats: true, boardSlug: true },
  });
  for (const h of holders)
    held.set(boardKey({ ats: h.ats!, boardSlug: h.boardSlug! }), h.name);

  // A Company with boardFoundAt set and no board had a wrong board cleared by hand, so it is never given one again.
  const boardless = await prisma.company.findMany({
    where: { ats: null, boardSlug: null, boardFoundAt: null },
    select: { id: true, name: true },
  });
  const names = new Map(boardless.map((c) => [c.id, c.name]));
  const sightings = await prisma.sighting.findMany({
    where: { directUrl: { not: null }, companyId: { in: [...names.keys()] } },
    select: { id: true, companyId: true, directUrl: true },
    orderBy: { id: "asc" },
  });

  const done = new Set<number>();
  for (const s of sightings) {
    if (done.has(s.companyId)) continue;
    const board = boardFromUrl(s.directUrl!);
    if (!board) continue;
    const name = names.get(s.companyId)!;
    counts.found++;

    const holder = held.get(boardKey(board));
    if (holder) {
      counts.skipped++;
      log(
        `skipped ${board.ats}/${board.boardSlug} for company="${name}" sighting=${s.id}: held by company="${holder}"`,
      );
      continue;
    }
    try {
      await prisma.company.update({
        where: { id: s.companyId },
        data: { ...board, boardFoundAt: new Date() },
      });
    } catch (err) {
      counts.failed++;
      log(
        `failed ${board.ats}/${board.boardSlug} for company="${name}" sighting=${s.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    done.add(s.companyId);
    held.set(boardKey(board), name);
    counts.processed++;
    log(
      `added ${board.ats}/${board.boardSlug} for company="${name}" sighting=${s.id}`,
    );
  }
  return counts;
}
