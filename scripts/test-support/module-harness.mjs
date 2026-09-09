import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL, fileURLToPath } from "node:url";

export async function runModule(filename, { globals = {}, replacements = {} } = {}) {
  const context = vm.createContext({
    console, process, Buffer, URL, Headers, Response, AbortController, setTimeout, clearTimeout, queueMicrotask,
    ...globals,
  });
  const modules = new Map();
  async function load(specifier, parent) {
    const replacement = replacements[specifier];
    const identifier = replacement || specifier.startsWith("node:")
      ? specifier
      : new URL(specifier, parent).href;
    if (modules.has(identifier)) return modules.get(identifier);
    let loaded;
    if (replacement || specifier.startsWith("node:")) {
      const values = replacement ?? await import(specifier);
      loaded = new vm.SyntheticModule(Object.keys(values), function () {
        for (const [name, value] of Object.entries(values)) this.setExport(name, value);
      }, { context, identifier });
    } else {
      loaded = new vm.SourceTextModule(fs.readFileSync(fileURLToPath(identifier), "utf8"), {
        context, identifier, initializeImportMeta: (meta) => { meta.url = identifier; },
      });
    }
    modules.set(identifier, loaded);
    await loaded.link((child, referring) => load(child, referring.identifier));
    return loaded;
  }
  const entry = await load(pathToFileURL(path.resolve(filename)).href);
  await entry.evaluate();
  return entry.namespace;
}
