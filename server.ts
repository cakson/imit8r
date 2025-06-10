import { createServer } from "http";
import { graphql, print, DocumentNode, OperationDefinitionNode } from "graphql";
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


interface Config {
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
  const configFile = fs.readFileSync(
    path.join(__dirname, "./config/config.yml"),
    "utf8"
  );
  return yaml.load(configFile) as Config;
};

const loadMocks = async (config: MockConfig): Promise<Mocks> => {
  const mocks: Mocks = {};
  const mocksDir = path.join(__dirname, "./mocks");
  const types = fs.existsSync(mocksDir) ? fs.readdirSync(mocksDir) : [];
  for (const type of types) {
    const typeConfig = config[type];
    if (typeConfig === -1) continue;
    if (typeof typeConfig === "string" || typeof typeConfig === "number") {
      await loadTypeLevelMock(type, typeConfig, mocks);
    } else if (typeof typeConfig === "object") {
      await loadFieldLevelMock(type, typeConfig as Record<string, string | number>, mocks);
    } else {
      await loadTypeLevelMock(type, 0, mocks);
    }
  }
  return mocks;
};

const loadTypeLevelMock = async (
  type: string,
  configValue: string | number | undefined,
  mocks: Mocks
) => {
  const directoryPath = path.join(__dirname, `./mocks/${type}`);
  if (!fs.existsSync(directoryPath)) return;
  const files = fs.readdirSync(directoryPath);
  const variant = configValue ?? 0;
  const mockFile = findMockFile(files, variant);
  if (!mockFile) return;
  const mockFilePath = path.join(directoryPath, mockFile);
  await importMockFile(mockFilePath, mocks, type);
};

const loadFieldLevelMock = async (
  type: string,
  configValue: Record<string, string | number>,
  mocks: Mocks
) => {
  mocks[type] = mocks[type] || {};
  const typeDir = path.join(__dirname, `./mocks/${type}`);
  const fields = fs.existsSync(typeDir) ? fs.readdirSync(typeDir) : [];
  for (const fieldName of fields) {
    const directoryPath = path.join(typeDir, fieldName);
    if (!fs.statSync(directoryPath).isDirectory()) continue;
    const index = configValue[fieldName];
    if (index === -1) continue;
    const files = fs.readdirSync(directoryPath);
    const variant = index !== undefined ? index : 0;
    const mockFile = findMockFile(files, variant);
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

const config = loadConfig();

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

const createPassthroughResolver = (
  operation: "query" | "mutation"
) => {
  return async (
    parent: any,
    args: any,
    context: any,
    info: any
  ) => {
    const fieldNode = info.fieldNodes[0];
    const op: OperationDefinitionNode = {
      kind: "OperationDefinition",
      operation,
      name: info.operation.name,
      variableDefinitions: info.operation.variableDefinitions,
      selectionSet: {
        kind: "SelectionSet",
        selections: [fieldNode],
      },
    };
    const doc: DocumentNode = {
      kind: "Document",
      definitions: [op, ...Object.values(info.fragments || {})],
    };
    const query = print(doc);
    const response = await fetch(config.downstream_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: context.token || "",
      },
      body: JSON.stringify({ query, variables: info.variableValues }),
    });
    const json = await response.json();
    const key = fieldNode.alias ? fieldNode.alias.value : info.fieldName;
    return json.data ? json.data[key] : undefined;
  };
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

  if (overrideConfig.Query === -1 || overrideConfig.Mutation === -1) {
    const response = await fetch(config.downstream_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: (req.headers.token as string) || "",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.text();
    res.setHeader("Content-Type", "application/json");
    res.end(result);
    return;
  }

  const mocks = await loadMocks(overrideConfig);
  if (typeof overrideConfig.Query === "object") {
    mocks.Query = mocks.Query || {};
    for (const [field, idx] of Object.entries(overrideConfig.Query)) {
      if (idx === -1) {
        mocks.Query[field] = createPassthroughResolver("query");
      }
    }
  }
  if (typeof overrideConfig.Mutation === "object") {
    mocks.Mutation = mocks.Mutation || {};
    for (const [field, idx] of Object.entries(overrideConfig.Mutation)) {
      if (idx === -1) {
        mocks.Mutation[field] = createPassthroughResolver("mutation");
      }
    }
  }

  const schema = addMocksToSchema({ schema: baseSchema, mocks });

  const result = await graphql({
    schema,
    source: payload.query,
    variableValues: payload.variables,
    contextValue: { token: req.headers.token },
  });

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(result));
});

const PORT = 44361;
server.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
});
