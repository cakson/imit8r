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

const loadConfig = (): Config => {
  const configFile = fs.readFileSync(path.join(__dirname, "./config/config.yml"), "utf8");
  return yaml.load(configFile) as Config;
};

const loadMocks = async (
  config: Config
): Promise<{ mocks: Mocks; passthrough: Passthrough }> => {
  const mocks: Mocks = {};
  const passthrough: Passthrough = {};
  for (const [type, configValue] of Object.entries(config.mocks)) {
    if (typeof configValue === "string" || typeof configValue === "number") {
      if (configValue === -1 && (type === "Query" || type === "Mutation")) {
        passthrough[type] = passthrough[type] || new Set();
        // passthrough all fields under this root type
        continue;
      }
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

const loadTypeLevelMock = async (type: string, configValue: string | number, mocks: Mocks) => {
  const directoryPath = path.join(__dirname, `./mocks/${type}`);
  const files = fs.existsSync(directoryPath) ? fs.readdirSync(directoryPath) : [];
  const mockFile = findMockFile(files, configValue);
  if (!mockFile) return;
  const mockFilePath = path.join(directoryPath, mockFile);
  await importMockFile(mockFilePath, mocks, type);
};

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

const findMockFile = (files: string[], configValue: string | number): string | undefined => {
  return (
    files.find((f) => f.startsWith(`${configValue}_`)) ||
    files.find((f) => f.match(new RegExp(`^${configValue}\\.ts$`)))
  );
};

const importMockFile = async (mockFilePath: string, target: any, key: string) => {
  try {
    const mod = await import(mockFilePath);
    target[key] = mod.default;
  } catch (e) {
    console.error(`Failed to load mock ${mockFilePath}`, e);
  }
};

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
        return json.data[info.fieldName];
      };
    }
  }
  return resolvers;
};

const defaultConfig = loadConfig();

const parseCookie = (cookieHeader: string | undefined): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  const pairs = cookieHeader.split(/; */);
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    result[key] = decodeURIComponent(val);
  }
  return result;
};

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

const server = createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

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

  const cookies = parseCookie(req.headers.cookie);
  const overrideConfig = cookies.mock_config
    ? (JSON.parse(cookies.mock_config) as MockConfig)
    : {};
  const finalConfig = mergeConfigs(defaultConfig, overrideConfig);
  const { mocks, passthrough } = await loadMocks(finalConfig);
  const resolvers = createPassthroughResolvers(passthrough, finalConfig.downstream_url);
  const schema = addMocksToSchema({
    schema: baseSchema,
    mocks,
    resolvers,
    preserveResolvers: true,
  });

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
  console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
});
