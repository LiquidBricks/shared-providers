import { s } from "./help.js";

export function makeExplain(monad) {
  return function explain() {
    console.log({
      data: Array.from(monad[s.INTERNALS].nodes.data.keys()),
      tasks: Array.from(monad[s.INTERNALS].nodes.tasks.keys()),
    });
    return monad;
  }
}
