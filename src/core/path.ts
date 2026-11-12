export interface Point {
  x: number;
  y: number;
}

export interface Path {
  readonly points: readonly Point[];
  readonly segmentLengths: readonly number[];
  readonly length: number;
}

/**
 * Length of the vector (dx, dy). The simulation uses this instead of the
 * built-in hypotenuse function: a square root is exact on every machine, while
 * the built-in may round differently from one browser to another, and online
 * play needs every player's simulation to agree to the last bit.
 */
export function length(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

export function createPath(points: readonly Point[]): Path {
  if (points.length < 2) {
    throw new Error('A path needs at least two points');
  }
  const segmentLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const segment = length(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segmentLengths.push(segment);
    total += segment;
  }
  return { points, segmentLengths, length: total };
}

/** Position after travelling `distance` from the start, clamped to the path ends. */
export function pointAt(path: Path, distance: number): Point {
  const first = path.points[0];
  if (distance <= 0) return { x: first.x, y: first.y };

  let remaining = distance;
  for (let i = 0; i < path.segmentLengths.length; i++) {
    const segment = path.segmentLengths[i];
    if (remaining <= segment && segment > 0) {
      const from = path.points[i];
      const to = path.points[i + 1];
      const t = remaining / segment;
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    }
    remaining -= segment;
  }

  const last = path.points[path.points.length - 1];
  return { x: last.x, y: last.y };
}
