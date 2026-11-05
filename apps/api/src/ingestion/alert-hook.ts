import { Injectable, Logger } from "@nestjs/common";

export interface Alert {
  // "blocked" is a board refusing us, "fault" is the scraper or network failing.
  kind: "blocked" | "fault";
  adapter: string;
  // The Company whose board failed, for board adapters.
  company?: string;
  message: string;
}

// The real channel is a later build ticket; an abstract class doubles as the Nest injection token.
export abstract class AlertHook {
  abstract alert(alert: Alert): Promise<void>;
}

@Injectable()
export class LogAlertHook extends AlertHook {
  private readonly logger = new Logger("Alert");

  async alert(alert: Alert): Promise<void> {
    this.logger.warn(`[${alert.kind}] ${alert.adapter}: ${alert.message}`);
  }
}
