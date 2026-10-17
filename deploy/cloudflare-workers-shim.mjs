export const env = typeof process !== "undefined" && process.env ? process.env : {};

export class DurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
}
