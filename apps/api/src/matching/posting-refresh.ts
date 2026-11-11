import { Posting, Prisma } from "@prisma/client";
import { precedenceOf } from "./sighting-draft";

// Text falls back past the top Sighting, so a bare alert never erases a description.
export async function refreshPosting(
  tx: Prisma.TransactionClient,
  postingId: number,
): Promise<Posting> {
  const sightings = await tx.sighting.findMany({ where: { postingId } });
  const ranked = [...sightings].sort(
    (a, b) =>
      precedenceOf(a.jobSource) - precedenceOf(b.jobSource) || a.id - b.id,
  );
  const top = ranked[0];
  const textSource =
    ranked.find((s) => s.descriptionKind === "full") ??
    ranked.find((s) => s.descriptionKind === "snippet") ??
    top;
  const postedAt = sightings.reduce(
    (earliest, s) => (s.reportedAt < earliest ? s.reportedAt : earliest),
    top.reportedAt,
  );
  return tx.posting.update({
    where: { id: postingId },
    data: {
      companyId: top.companyId,
      title: top.title,
      location: top.location,
      description: textSource.description,
      descriptionKind: textSource.descriptionKind,
      postedAt,
    },
  });
}
