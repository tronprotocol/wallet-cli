import { expect, it } from "vitest";
import * as index from "./index.js";
import * as domain from "./domain.js";
import * as application from "./application.js";
import * as cli from "./cli.js";
import * as http from "./http.js";

// Every runtime export is part of the plugin contract; a change here raises the API version or revision.
it("pins the runtime export names of each plugin-api entry", () => {
  const names = Object.fromEntries(
    Object.entries({ index, domain, application, cli, http }).map(([entry, mod]) => [
      entry,
      Object.keys(mod).sort(),
    ]),
  );
  expect(names).toMatchSnapshot();
});
