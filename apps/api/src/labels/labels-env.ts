// Abstract classes double as Nest injection tokens; tests replace them to fix the date and the draw.
export abstract class Clock {
  abstract now(): Date;
}
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

export abstract class Random {
  // A number in [0, 1).
  abstract next(): number;
}
export class MathRandom extends Random {
  next(): number {
    return Math.random();
  }
}
