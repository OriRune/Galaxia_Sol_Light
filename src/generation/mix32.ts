export function mix32(value: number) {
  let result = value >>> 0;
  result = (result ^ (result >>> 16)) >>> 0;
  result = Math.imul(result, 0x7feb352d) >>> 0;
  result = (result ^ (result >>> 15)) >>> 0;
  result = Math.imul(result, 0x846ca68b) >>> 0;
  return (result ^ (result >>> 16)) >>> 0;
}
