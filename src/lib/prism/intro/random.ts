export class SeededRandom {
  private state: number;

  constructor(seed = 0x51f15e) {
    this.state = seed >>> 0;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return (this.state >>> 0) / 0xffffffff;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  signed(amount = 1): number {
    return (this.next() * 2 - 1) * amount;
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[
      Math.min(
        items.length - 1,
        Math.floor(this.next() * items.length),
      )
    ];
  }
}

export function randomSphere(
  random: SeededRandom,
): { x: number; y: number; z: number } {
  const z = random.range(-1, 1);
  const theta = random.range(0, Math.PI * 2);
  const radius = Math.sqrt(1 - z * z);

  return {
    x: radius * Math.cos(theta),
    y: radius * Math.sin(theta),
    z,
  };
}

export function randomDisk(
  random: SeededRandom,
  inner = 0,
  outer = 1,
): { x: number; y: number } {
  const theta = random.range(0, Math.PI * 2);
  const r = Math.sqrt(
    random.range(inner * inner, outer * outer),
  );

  return {
    x: Math.cos(theta) * r,
    y: Math.sin(theta) * r,
  };
}
