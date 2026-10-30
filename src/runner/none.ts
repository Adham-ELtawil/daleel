import { RunnerError, type Runner } from "./runner";

export class RunnerOff extends RunnerError {
  constructor() {
    super("runner_off", "Runner is off");
    this.name = "RunnerOff";
  }
}
export function createNoneRunner(): Runner {
  return {
    name: "none",
    compile: async () => {
      throw new RunnerOff();
    },
    run: async () => {
      throw new RunnerOff();
    },
    dispose: async () => {},
  };
}
