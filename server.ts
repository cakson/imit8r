import { createServer } from "http";
import { graphql } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { addMocksToSchema } from "@graphql-tools/mock";
import { loadFilesSync } from "@graphql-tools/load-files";
import { mergeTypeDefs } from "@graphql-tools/merge";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";

interface MockResolver {
  [key: string]: () => unknown;
}

interface Mocks {
  [type: string]: MockResolver;
}

interface Passthrough {
  [type: string]: Set<string>;
}

interface Config {
  mocks: MockConfig;
  downstream_url: string;
}

interface MockConfig {
  [type: string]: Record<string, string | number> | string | number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const typeDefs = mergeTypeDefs(loadFilesSync(path.join(__dirname, "./schema/*.graphql")));
const baseSchema = makeExecutableSchema({ typeDefs });

// Minimal HTML that loads GraphQL Playground from a CDN.  Browsers hitting the
// server via GET receive this page, allowing manual exploration of the mocked
// schema.  The playground sends requests back to the same /graphql endpoint used
// by API clients.
const playgroundHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GraphQL Playground</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/graphql-playground-react@1.7.42/build/static/css/index.css" />
    <link rel="shortcut icon" href="https://cdn.jsdelivr.net/npm/graphql-playground-react@1.7.42/build/favicon.png" />
    <script src="https://cdn.jsdelivr.net/npm/graphql-playground-react@1.7.42/build/static/js/middleware.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.addEventListener('load', function () {
        GraphQLPlayground.init(document.getElementById('root'), { endpoint: '/graphql' });
      });
    </script>
  </body>
</html>`;

// Scan the local mocks directory to discover which types/fields have a `0.ts`
// mock variant. We use this information so that missing entries in config
// automatically fall back to variant 0.
const discoverDefaults = (): MockConfig => {
  const defaults: MockConfig = {};
  const root = path.join(__dirname, "./mocks");
  if (!fs.existsSync(root)) return defaults;
  for (const type of fs.readdirSync(root)) {
    const typePath = path.join(root, type);
    if (!fs.statSync(typePath).isDirectory()) continue;
    const entries = fs.readdirSync(typePath);
    if (entries.some((f) => f.match(/^0(\.|_)/))) {
      defaults[type] = 0;
    }
    for (const field of entries) {
      const fieldPath = path.join(typePath, field);
      if (!fs.statSync(fieldPath).isDirectory()) continue;
      const files = fs.readdirSync(fieldPath);
      if (files.some((f) => f.match(/^0(\.|_)/))) {
        if (typeof defaults[type] !== "object") {
          defaults[type] = {};
        }
        (defaults[type] as Record<string, string | number>)[field] = 0;
      }
    }
  }
  return defaults;
};

// Cache discovered defaults so we don't hit the filesystem on every request.
const discoveredDefaultMocks = discoverDefaults();

const loadConfig = (): Config => {
  const configFile = fs.readFileSync(path.join(__dirname, "./config/config.yml"), "utf8");
  return yaml.load(configFile) as Config;
};

// Load mock modules based on the configuration file and cookie overrides.
// `passthrough` keeps track of fields whose variant is `-1`, meaning the
// request for those fields should be forwarded to the real API instead of
// being mocked locally.
const loadMocks = async (
  config: Config
): Promise<{ mocks: Mocks; passthrough: Passthrough }> => {
  const mocks: Mocks = {};
  const passthrough: Passthrough = {};
  for (const [type, configValue] of Object.entries(config.mocks)) {
    if (typeof configValue === "string" || typeof configValue === "number") {
      await loadTypeLevelMock(type, configValue, mocks);
    } else {
      await loadFieldLevelMock(
        type,
        configValue as Record<string, string | number>,
        mocks,
        passthrough
      );
    }
  }
  return { mocks, passthrough };
};

// Load a mock implementation for an entire type (e.g. `Query` or `User`).
// `configValue` indicates which variant file to load from `mocks/<type>`.
const loadTypeLevelMock = async (type: string, configValue: string | number, mocks: Mocks) => {
  const directoryPath = path.join(__dirname, `./mocks/${type}`);
  const files = fs.existsSync(directoryPath) ? fs.readdirSync(directoryPath) : [];
  const mockFile = findMockFile(files, configValue);
  if (!mockFile) return;
  const mockFilePath = path.join(directoryPath, mockFile);
  await importMockFile(mockFilePath, mocks, type);
};

// Load mocks for individual fields of a type. If a field's variant is `-1`
// we record it in `passthrough` so the downstream server handles it.
const loadFieldLevelMock = async (
  type: string,
  configValue: Record<string, string | number>,
  mocks: Mocks,
  passthrough: Passthrough
) => {
  mocks[type] = mocks[type] || {};
  for (const [fieldName, index] of Object.entries(configValue)) {
    if (index === -1 && (type === "Query" || type === "Mutation")) {
      passthrough[type] = passthrough[type] || new Set();
      passthrough[type].add(fieldName);
      continue;
    }
    const directoryPath = path.join(__dirname, `./mocks/${type}/${fieldName}`);
    const files = fs.existsSync(directoryPath) ? fs.readdirSync(directoryPath) : [];
    const mockFile = findMockFile(files, index);
    if (!mockFile) continue;
    const mockFilePath = path.join(directoryPath, mockFile);
    await importMockFile(mockFilePath, mocks[type], fieldName);
  }
};

// Resolve the file that matches the requested variant index. We allow both
// `<index>_description.ts` and `<index>.ts` naming schemes for convenience.
const findMockFile = (files: string[], configValue: string | number): string | undefined => {
  return (
    files.find((f) => f.startsWith(`${configValue}_`)) ||
    files.find((f) => f.match(new RegExp(`^${configValue}\\.ts$`)))
  );
};

// Dynamically import a mock implementation and attach it to the given target
// object. Failures are logged but do not crash the server so missing mocks are
// easier to debug.
const importMockFile = async (mockFilePath: string, target: any, key: string) => {
  try {
    const mod = await import(mockFilePath);
    target[key] = mod.default;
  } catch (e) {
    console.error(`Failed to load mock ${mockFilePath}`, e);
  }
};

// Build resolver functions that simply proxy matching fields to the downstream
// GraphQL server. Each resolver issues an HTTP POST to `url` with the original
// query and variables so the real server can execute it. Only the field marked
// with variant `-1` is returned to preserve existing mock data for other
// fields.
const createPassthroughResolvers = (
  passthrough: Passthrough,
  url: string
) => {
  const resolvers: Record<string, Record<string, any>> = {};
  for (const [type, fields] of Object.entries(passthrough)) {
    resolvers[type] = resolvers[type] || {};
    for (const field of fields) {
      resolvers[type][field] = async (
        _parent: unknown,
        _args: unknown,
        context: any,
        info: any
      ) => {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(context.token ? { token: context.token } : {}),
          },
          body: JSON.stringify({
            query: context.originalQuery,
            variables: context.variables,
          }),
        });
        const json = await response.json();
        if (json.errors) {
          throw new Error(JSON.stringify(json.errors));
        }
        // Return only the requested field's value from the downstream response
        // so the rest of the mocked schema stays untouched.
        return json.data[info.fieldName];
      };
    }
  }
  return resolvers;
};

const defaultConfig = loadConfig();

// Very small cookie parser that returns an object mapping cookie names to
// values. A malformed cookie should result in a clear 400 error instead of
// crashing the server, so we throw if decoding fails and let the caller handle
// it.
const parseCookie = (cookieHeader: string | undefined): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  const pairs = cookieHeader.split(/; */);
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      // Bubble up a failure to decode so the HTTP handler can respond with 400
      // rather than letting the server crash.
      throw new Error("Invalid cookie encoding");
    }
  }
  return result;
};

// Merge the base configuration loaded from `config.yml` with any overrides
// provided via the `mock_config` cookie.
const mergeConfigs = (base: Config, override: Partial<MockConfig>): Config => {
  const merged: MockConfig = JSON.parse(JSON.stringify(base.mocks));
  for (const [type, value] of Object.entries(override)) {
    if (typeof value === "string" || typeof value === "number") {
      merged[type] = value;
    } else {
      merged[type] = merged[type] || {};
      const baseFields = merged[type] as Record<string, string | number>;
      for (const [field, idx] of Object.entries(value || {})) {
        baseFields[field] = idx;
      }
    }
  }
  return { mocks: merged, downstream_url: base.downstream_url };
};

// Apply discovered default variant "0" for any type or field not explicitly
// configured. This ensures `mock_config=` behaves the same as specifying
// `0` for every available mock.
const applyDefaultMocks = (config: Config): Config => {
  const merged: MockConfig = JSON.parse(JSON.stringify(config.mocks));
  for (const [type, value] of Object.entries(discoveredDefaultMocks)) {
    if (!(type in merged)) {
      merged[type] = value;
      continue;
    }
    if (
      typeof value === "object" &&
      typeof merged[type] === "object" &&
      merged[type] !== null
    ) {
      const target = merged[type] as Record<string, string | number>;
      for (const [field, idx] of Object.entries(value as Record<string, string | number>)) {
        if (!(field in target)) {
          target[field] = idx;
        }
      }
    }
  }
  return { ...config, mocks: merged };
};

// HTTP server that accepts GraphQL POST requests. The incoming request body is
// parsed and combined with any `mock_config` cookie. The resulting config is
// used to load mock modules and build the executable schema on the fly.
const server = createServer(async (req, res) => {
  // Browsers often issue a GET request when visiting the server directly. In
  // that case we serve GraphQL Playground so developers can experiment with the
  // mock API interactively.
  if (req.method === "GET") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    res.end(playgroundHtml);
    return;
  }

  // Enforce POST for actual GraphQL queries to keep the implementation simple.
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  // Collect the request payload.
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  await new Promise((resolve) => req.on("end", resolve));

  let payload: { query: string; variables?: any };
  try {
    payload = JSON.parse(body);
  } catch {
    res.statusCode = 400;
    res.end("Invalid JSON");
    return;
  }

  // Cookie-based override allows clients to pick variants dynamically. Parsing
  // can fail if the cookie is malformed, so handle those cases gracefully and
  // return a helpful 400 error instead of crashing.
  let cookies: Record<string, string>;
  try {
    cookies = parseCookie(req.headers.cookie);
  } catch {
    res.statusCode = 400;
    res.end("Invalid cookie");
    return;
  }

  let overrideConfig: Partial<MockConfig> = {};
  if (cookies.mock_config) {
    try {
      overrideConfig = JSON.parse(cookies.mock_config) as MockConfig;
    } catch {
      res.statusCode = 400;
      res.end("Invalid mock_config cookie");
      return;
    }
  }
  // Merge cookie overrides with config.yml and apply default variant "0" where
  // no variant is specified.
  const finalConfig = applyDefaultMocks(
    mergeConfigs(defaultConfig, overrideConfig)
  );
  const { mocks, passthrough } = await loadMocks(finalConfig);
  const resolvers = createPassthroughResolvers(passthrough, finalConfig.downstream_url);
  // Compose the executable schema by combining the original schema, loaded
  // mocks, and passthrough resolvers for any fields marked with `-1`.
  const schema = addMocksToSchema({
    schema: baseSchema,
    mocks,
    resolvers,
    preserveResolvers: true,
  });

  // Execute the query against the mocked schema. We pass the original query
  // and variables through the context so passthrough resolvers can forward them
  // unchanged to the real server when necessary.
  const result = await graphql({
    schema,
    source: payload.query,
    variableValues: payload.variables,
    contextValue: {
      token: req.headers.token,
      originalQuery: payload.query,
      variables: payload.variables,
    },
  });

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(result));
});

const PORT = 44361;
server.listen(PORT, () => {
  // eslint-disable-next-line no-console -- helpful during development
  console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
});
