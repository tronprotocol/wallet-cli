import vm from "node:vm";

export type PluginImporter = (url: string) => Promise<{ default?: unknown }>;

const VM_LOADER_WARNING = "vm.USE_MAIN_CONTEXT_DEFAULT_LOADER is an experimental feature";

// Imports through the main context's default ESM loader, which a single executable keeps for vm code only.
// The loader's ExperimentalWarning is emitted synchronously inside the import call; only that one is dropped.
export function vmLoaderImporter(): PluginImporter {
  const load = new vm.Script("(url) => import(url)", {
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  }).runInThisContext() as PluginImporter;
  return (url) => {
    const emitWarning = process.emitWarning;
    process.emitWarning = function (warning: string | Error, ...rest: unknown[]) {
      const text = typeof warning === "string" ? warning : warning.message;
      if (text.startsWith(VM_LOADER_WARNING)) return;
      return (emitWarning as (...args: unknown[]) => void).call(process, warning, ...rest);
    } as typeof process.emitWarning;
    try {
      return load(url);
    } finally {
      process.emitWarning = emitWarning;
    }
  };
}

// In a single executable, import() in the embedded script loads only built-in modules.
export function pluginImporter(): PluginImporter {
  return isSea() ? vmLoaderImporter() : (url) => import(url);
}

// Not a static import: the npm bundle drops the `node:` prefix, and `sea` has no name without it.
export function isSea(): boolean {
  return process.getBuiltinModule("node:sea").isSea();
}
