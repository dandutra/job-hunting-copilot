import { PrismaService } from "../prisma/prisma.service";
import { boardFromUrl } from "./board-from-url";

export interface DiscoverCounts {
  found: number;
  processed: number;
  skipped: number;
  failed: number;
}

const pairKey = (ats: string, slug: string) => `${ats}:${slug.toLowerCase()}`;

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

  // Compared without case, because the listing key lowercases a slug and two spellings would poll one board twice.
  const held = new Map<string, string>();
  const holders = await prisma.company.findMany({
    where: { ats: { not: null }, boardSlug: { not: null } },
    select: { name: true, ats: true, boardSlug: true },
  });
  for (const h of holders) held.set(pairKey(h.ats!, h.boardSlug!), h.name);

  const boardless = await prisma.company.findMany({
    where: { ats: null, boardSlug: null },
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
    const name = names.get(s.companyId)!;
    if (!board) continue;
    counts.found++;

    const holder = held.get(pairKey(board.ats, board.boardSlug));
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
    held.set(pairKey(board.ats, board.boardSlug), name);
    counts.processed++;
    log(
      `added ${board.ats}/${board.boardSlug} for company="${name}" sighting=${s.id}`,
    );
  }
  return counts;
}
