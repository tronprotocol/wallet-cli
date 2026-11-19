import { fork, spawn, type ChildProcess } from "node:child_process";
import type {
  CliLauncher,
  DetachedCli,
  DetachedCliStart,
} from "../../../application/ports/cli-launcher.js";

// A single executable runs itself; an npm install runs its entry script again with the same Node.
export class ProcessCliLauncher implements CliLauncher {
  // Not a static import: the npm bundle drops the `node:` prefix, and `sea` has no name without it.
  constructor(
    private readonly singleExecutable: () => boolean = () =>
      process.getBuiltinModule("node:sea").isSea(),
  ) {}

  startDetached(start: DetachedCliStart): DetachedCli {
    const options = {
      detached: true,
      stdio: ["ignore", "ignore", start.stderr, "ipc"] as ("ignore" | "ipc" | number)[],
      env: { ...start.env },
    };
    const child: ChildProcess = this.singleExecutable()
      ? spawn(process.execPath, [...start.argv], options)
      : fork(process.argv[1]!, [...start.argv], options);
    return child;
  }
}
