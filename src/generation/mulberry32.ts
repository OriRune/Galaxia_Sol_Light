export class Mulberry32 {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextUint32() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1) >>> 0;
    value = (value ^ ((value + Math.imul(value ^ (value >>> 7), value | 61)) >>> 0)) >>> 0;
    return (value ^ (value >>> 14)) >>> 0;
  }

  nextFloat() {
    return this.nextUint32() / 4_294_967_296;
  }

  getState() {
    return this.state;
  }
}
