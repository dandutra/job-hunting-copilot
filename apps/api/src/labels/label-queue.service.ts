import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { QueuePostingDto, SubmitLabelDto, TierValue } from "./labels.dto";
import { Clock, Random } from "./labels-env";
import { underLabelsLock } from "./queue-lock";
import { ActiveWindow, activeWindow, LABEL_SCHEDULE } from "./schedule";

type Tx = Prisma.TransactionClient;
type Slots = Record<TierValue, number>;

const BATCH_SIZE = 10;
const BATCH_SLOTS: Slots = { A: 3, B: 3, C: 4 };
const SPOT_CHECK_SLOTS: Slots = { A: 0, B: 0, C: 10 };
const TEST_TOTAL = 70;
const TEST_REPEATS = 10;
const SPOT_CHECK_TOTAL = 20;
const CAPPED_SHARE = 0.25;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TIERS: TierValue[] = ["A", "B", "C"];

// A test-phase "can't tell" is replaced, so it does not fill its slot.
const FILLS_A_SLOT = {
  slot: { not: null },
  NOT: { phase: "test", label: "cant_tell" },
} satisfies Prisma.LabelWhereInput;

interface Draw {
  postingId: number;
  tierAtDraw: string;
  slot: string | null;
  configVersion: string;
  phase: string;
}

@Injectable()
export class LabelQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly random: Random,
  ) {}

  next(): Promise<QueuePostingDto | null> {
    return underLabelsLock(this.prisma, async (tx) => {
      const window = activeWindow(this.clock.now());
      let draw: Draw | null = await tx.labelDraw.findFirst();
      if (draw && !(window && drawBelongsTo(draw, window))) {
        await tx.labelDraw.deleteMany();
        draw = null;
      }
      if (!draw && window) draw = await this.draw(tx, window);
      if (!draw) return null;
      const p = await tx.posting.findUniqueOrThrow({
        where: { id: draw.postingId },
        include: { company: true },
      });
      return {
        postingId: p.id,
        title: p.title,
        company: p.company.name,
        location: p.location,
        text: p.description,
      };
    });
  }

  submit(body: SubmitLabelDto): Promise<{ id: number; batchDone: boolean }> {
    return underLabelsLock(this.prisma, async (tx) => {
      const window = activeWindow(this.clock.now());
      const draw = await tx.labelDraw.findFirst();
      if (!draw || draw.postingId !== body.postingId)
        throw new ConflictException("The queue is not showing that Posting.");
      if (!window || !drawBelongsTo(draw, window)) {
        await tx.labelDraw.deleteMany();
        throw new ConflictException("That Label phase has ended.");
      }
      const batch = await openBatch(tx, window);
      const label = await tx.label.create({
        data: {
          postingId: draw.postingId,
          label: body.label,
          tierAtDraw: draw.tierAtDraw,
          slot: draw.slot,
          configVersion: draw.configVersion,
          phase: draw.phase,
          batch: batch.number,
          createdAt: this.clock.now(),
        },
      });
      await tx.labelDraw.deleteMany();
      const filled = await tx.label.count({
        where: { batch: batch.number, ...FILLS_A_SLOT },
      });
      return { id: label.id, batchDone: filled >= BATCH_SIZE };
    });
  }

  // Only a mis-key in the batch under way may go, so calibration never loses a finished batch.
  undoLast(): Promise<void> {
    return underLabelsLock(this.prisma, async (tx) => {
      const now = this.clock.now();
      const window = activeWindow(now);
      const last = await tx.label.findFirst({ orderBy: { id: "desc" } });
      if (!last) throw new ConflictException("There is no Label to undo.");
      // A Label from a closed window could never be re-keyed into its own phase.
      if (!window || last.createdAt < window.start)
        throw new ConflictException("The batch is done.");
      const filled = await tx.label.count({
        where: { batch: last.batch, ...FILLS_A_SLOT },
      });
      if (filled >= BATCH_SIZE)
        throw new ConflictException("The batch is done.");
      await tx.label.delete({ where: { id: last.id } });
      await tx.labelDraw.deleteMany();
      await tx.labelDraw.create({
        data: {
          postingId: last.postingId,
          tierAtDraw: last.tierAtDraw,
          slot: last.slot,
          configVersion: last.configVersion,
          phase: last.phase,
          drawnAt: now,
        },
      });
    });
  }

  private async draw(tx: Tx, window: ActiveWindow): Promise<Draw | null> {
    const batch = await openBatch(tx, window);
    let draw: Draw | null = null;
    if (window.phase === "test") {
      const [counted, repeats] = await Promise.all([
        tx.label.count({
          where: {
            phase: "test",
            createdAt: { gte: window.start },
            ...FILLS_A_SLOT,
          },
        }),
        tx.label.count({
          where: { phase: "repeat", createdAt: { gte: window.start } },
        }),
      ]);
      const stillToCount = TEST_TOTAL - counted;
      const stillToRepeat = TEST_REPEATS - repeats;
      const wantRepeat =
        stillToRepeat > 0 &&
        (stillToCount <= 0 ||
          this.random.next() < stillToRepeat / (stillToRepeat + stillToCount));
      if (wantRepeat) draw = await this.drawRepeat(tx, window);
      if (!draw && stillToCount > 0)
        draw = await this.drawSlot(tx, window, batch.filled);
    } else if (window.phase === "spot_check") {
      const counted = await tx.label.count({
        where: { phase: "spot_check", createdAt: { gte: window.start } },
      });
      if (counted < SPOT_CHECK_TOTAL)
        draw = await this.drawSlot(tx, window, batch.filled);
    } else {
      draw = await this.drawSlot(tx, window, batch.filled);
    }
    if (draw)
      await tx.labelDraw.create({
        data: { ...draw, drawnAt: this.clock.now() },
      });
    return draw;
  }

  // A week-1 Label the user gave A, B or C, shown again to measure how often they match themselves.
  private async drawRepeat(tx: Tx, window: ActiveWindow): Promise<Draw | null> {
    const tuning = LABEL_SCHEDULE.windows.find((w) => w.phase === "tuning");
    if (!tuning) return null;
    const done = await tx.label.findMany({
      where: { phase: "repeat", createdAt: { gte: window.start } },
      select: { postingId: true },
    });
    const pool = await tx.label.findMany({
      where: {
        phase: "tuning",
        label: { not: "cant_tell" },
        createdAt: {
          gte: tuning.from,
          lt: new Date(tuning.from.getTime() + WEEK_MS),
        },
        postingId: { notIn: done.map((d) => d.postingId) },
      },
      orderBy: { id: "asc" },
    });
    if (!pool.length) return null;
    const old = pool[Math.floor(this.random.next() * pool.length)];
    const tier = await tx.postingTier.findUnique({
      where: { postingId: old.postingId },
    });
    return {
      postingId: old.postingId,
      tierAtDraw: tier?.tier ?? old.tierAtDraw,
      slot: null,
      configVersion: tier?.configVersion ?? old.configVersion,
      phase: "repeat",
    };
  }

  private async drawSlot(
    tx: Tx,
    window: ActiveWindow,
    filled: Slots,
  ): Promise<Draw | null> {
    const quota =
      window.phase === "spot_check" ? SPOT_CHECK_SLOTS : BATCH_SLOTS;
    const open = TIERS.filter((t) => quota[t] - filled[t] > 0);
    // Picking a slot by what is left makes the batch a uniform shuffle of its 3, 3 and 4.
    while (open.length) {
      const left = open.map((t) => quota[t] - filled[t]);
      let r = this.random.next() * left.reduce((a, b) => a + b, 0);
      let i = 0;
      while (i < open.length - 1 && r >= left[i]) r -= left[i++];
      const slot = open.splice(i, 1)[0];
      // A short Tier draws from the next one down; C has nothing below it.
      for (const tier of TIERS.slice(TIERS.indexOf(slot))) {
        const found = await this.pick(tx, tier, window.phase);
        if (found)
          return {
            postingId: found.id,
            tierAtDraw: tier,
            slot,
            configVersion: found.tier!.configVersion,
            phase: window.phase,
          };
      }
    }
    return null;
  }

  // About 1 in 4 C picks is a capped Posting, to catch a wrong Tier cap.
  private async pick(tx: Tx, tier: TierValue, phase: ActiveWindow["phase"]) {
    const eligible = (capped?: boolean): Prisma.PostingWhereInput => ({
      // Thin follows the description kind (see isThin).
      descriptionKind: "full",
      labels: { none: {} },
      labelDraw: null,
      sightings: {
        none: { firstSeenAt: { lt: LABEL_SCHEDULE.firstSeenFrom } },
      },
      tier: {
        is: {
          tier,
          ...(capped === undefined
            ? {}
            : { capsApplied: capped ? { isEmpty: false } : { isEmpty: true } }),
        },
      },
    });
    const wanted =
      tier === "C" && phase !== "spot_check"
        ? this.random.next() < CAPPED_SHARE
        : undefined;
    const order = wanted === undefined ? [undefined] : [wanted, !wanted];
    for (const capped of order) {
      const where = eligible(capped);
      const n = await tx.posting.count({ where });
      if (!n) continue;
      const [found] = await tx.posting.findMany({
        where,
        orderBy: { id: "asc" },
        skip: Math.floor(this.random.next() * n),
        take: 1,
        include: { tier: true },
      });
      return found;
    }
    return null;
  }
}

// A draw left over from an earlier window, even of the same phase, would count toward the wrong window.
function drawBelongsTo(
  draw: { phase: string; drawnAt?: Date },
  window: ActiveWindow,
) {
  return (
    (draw.phase === "repeat" ? "test" : draw.phase) === window.phase &&
    (!draw.drawnAt || draw.drawnAt >= window.start)
  );
}

// The batch under way: the last Label's batch while it has room and falls in this window, else the next number.
async function openBatch(tx: Tx, window: ActiveWindow) {
  const last = await tx.label.findFirst({ orderBy: { id: "desc" } });
  const empty: Slots = { A: 0, B: 0, C: 0 };
  if (!last) return { number: 1, filled: empty };
  const rows = await tx.label.groupBy({
    by: ["slot"],
    where: { batch: last.batch, ...FILLS_A_SLOT },
    _count: true,
  });
  const filled = { ...empty };
  let total = 0;
  for (const r of rows) {
    filled[r.slot as TierValue] += r._count;
    total += r._count;
  }
  return last.createdAt >= window.start && total < BATCH_SIZE
    ? { number: last.batch, filled }
    : { number: last.batch + 1, filled: empty };
}
