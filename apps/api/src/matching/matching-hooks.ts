import { Injectable } from "@nestjs/common";
import { Posting } from "@prisma/client";

// Jev attaches here later; an abstract class doubles as the Nest injection token.
export abstract class MatchingHooks {
  // Called once when a Posting's description moves from none or snippet to full.
  abstract descriptionUpgraded(posting: Posting): Promise<void>;
}

@Injectable()
export class NoopMatchingHooks extends MatchingHooks {
  async descriptionUpgraded(): Promise<void> {}
}
