export interface FloatPrng {
  nextFloat(): number;
}

export function normalLike(prng: FloatPrng) {
  let sum = 0;
  for (let draw = 0; draw < 12; draw += 1) sum += prng.nextFloat();
  return sum - 6;
}
