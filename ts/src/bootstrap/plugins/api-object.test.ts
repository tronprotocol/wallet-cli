import { describe, expect, it } from "vitest";
import * as index from "../../plugin-api/index.js";
import * as domain from "../../plugin-api/domain.js";
import * as application from "../../plugin-api/application.js";
import * as cli from "../../plugin-api/cli.js";
import * as http from "../../plugin-api/http.js";
import { PLUGIN_API_GLOBAL, PLUGIN_API_OBJECT, publishPluginApi } from "./api-object.js";

describe("the plugin API object", () => {
  it("holds every runtime export of the five entries", () => {
    const entries = { index, domain, application, cli, http };
    for (const [name, module] of Object.entries(entries)) {
      const object = PLUGIN_API_OBJECT[name as keyof typeof PLUGIN_API_OBJECT] as Record<
        string,
        unknown
      >;
      expect(Object.keys(object).sort()).toEqual(Object.keys(module).sort());
      for (const key of Object.keys(module)) {
        expect(object[key]).toBe((module as Record<string, unknown>)[key]);
      }
    }
  });

  it("is published once, under its global symbol, and cannot be replaced", () => {
    publishPluginApi();
    publishPluginApi();
    const holder = globalThis as Record<symbol, unknown>;
    expect(holder[PLUGIN_API_GLOBAL]).toBe(PLUGIN_API_OBJECT);
    expect(() => {
      holder[PLUGIN_API_GLOBAL] = {};
    }).toThrow();
    expect(Object.isFrozen(PLUGIN_API_OBJECT.domain)).toBe(true);
  });
});
