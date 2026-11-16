import { expect, it } from "vitest";
import { agentShowText } from "./render.js";
it("renders known metadata fields without terminal controls or unknown fields", () => {
  const rendered = agentShowText({
    agentId: "1",
    metadata: {
      name: "Agent\x1b\x07\r\n",
      description: "First. Second.",
      unknownField: "DO_NOT_RENDER",
    },
  });
  expect(rendered).toContain("Agent");
  expect(rendered).not.toContain("DO_NOT_RENDER");
  expect(rendered).not.toContain("\x1b");
  expect(rendered).not.toContain("\x07");
});
