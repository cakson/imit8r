# Imit8r

Imit8r is a small GraphQL server that serves your schema with mock responses.  Mocks can be swapped on the fly and any field can be forwarded to a real API.  This lets you quickly imitate many server behaviours during development without touching your client code.

## Features

- Multiple mock variants per field or type
- Request time selection of variants using a cookie
- Optional passthrough of fields to a real GraphQL server
- Simple file based configuration and schema loading

## Installation

```bash
npm install
```

## Running the server

```bash
npm start
```

The server listens on **http://localhost:44361/graphql**.

## Project layout

```
.
├── schema/        # GraphQL schema files (*.graphql)
├── mocks/         # Mock implementations
├── config/        # Configuration
└── server.ts      # Server implementation
```

### Schema

Put your GraphQL schema files under the `schema/` directory.  All `*.graphql` files are merged on start.

### Writing mocks

Mocks live in `mocks/<Type>/<field>/<variant>.ts` for field level mocks or in `mocks/<Type>/<variant>.ts` for type level mocks.  Each file should **export a default value or function** returning the value.

Example field mock:

```ts
// mocks/Query/hello/0.ts
export default () => ({
  foo: "Hello default",
  abc: "Example",
  num: 42,
});
```

Variant numbers begin at `0`.  A file named `0.ts` is treated as the default when no variant is specified.

### Configuration

Edit `config/config.yml` to select the default mock variants and specify the downstream GraphQL API used for passthroughs.

```yaml
downstream_url: "http://localhost:4000/graphql"

mocks:
  Query:
    hello: 0
    world: 0
```

- `downstream_url` – real GraphQL endpoint used when a field is set to `-1`.
- `mocks` – default variant for each type or field.  Omit entries to fall back to `0.ts` when available.

Restart the server after changing `config.yml`.

### Selecting variants per request

Clients can override the configuration without restarting the server by sending a `mock_config` cookie.  The format mirrors the `mocks` section from the configuration file.

```
mock_config={"Query":{"hello":1,"world":-1}}
```

Numbers select a variant in the `mocks` directory.  Using `-1` forwards that field to the real server specified by `downstream_url`.

### Passthrough example

To fetch data for `Query.world` from the real API while using local mocks for everything else:

```
mock_config={"Query":{"world":-1}}
```

The rest of the query is resolved by the selected mocks.

## Development notes

The server is written in TypeScript and executed via `tsx`.  After modifying the schema or mocks you will need to restart the server.  For contribution guidelines see [AGENTS.md](./AGENTS.md).
