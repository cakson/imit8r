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
// mocks/Mutation/createPost/0.ts
export default () => ({
  id: "101",
  title: "Created post",
  content: "New post content",
});
```

Example query mock:

```ts
// mocks/Query/user/0.ts - found user
export default () => ({
  id: "2",
  name: "Bob",
  role: "USER",
  posts: []
});

// mocks/Query/user/1.ts - not found variant throws an error
import { GraphQLError } from "graphql";
export default () => {
  throw new GraphQLError("User not found");
};
```

Variant numbers begin at `0`.  A file named `0.ts` is treated as the default when no variant is specified.

Mocks are optional.  If a field or type has no mock file the server automatically
generates values based on the GraphQL schema.  For example `Query.posts` in the
sample schema works without any mock file because the `Post` and `User` type
level mocks provide shape information for auto generated data.

### Configuration

Edit `config/config.yml` to select the default mock variants and specify the downstream GraphQL API used for passthroughs.

```yaml
downstream_url: "http://localhost:4000/graphql"

mocks:
  Mutation:
    login: 0
```

- `downstream_url` – real GraphQL endpoint used when a field is set to `-1`.
- `mocks` – default variant for each type or field.  Omit entries to fall back to `0.ts` when available.

Restart the server after changing `config.yml`.

### Selecting variants per request

Clients can override the configuration without restarting the server by sending a `mock_config` cookie.  The format mirrors the `mocks` section from the configuration file.

```
mock_config={"Mutation":{"login":1},"Query":{"posts":-1}}
```

Numbers select a variant in the `mocks` directory.  Using `-1` forwards that field to the real server specified by `downstream_url`.

For example the `login` mutation provides two variants:

```ts
// mocks/Mutation/login/0.ts - success
export default () => ({
  token: "abcd1234",
  user: { id: "1", name: "Alice", role: "ADMIN" }
});

// mocks/Mutation/login/1.ts - error variant throws an error
import { GraphQLError } from "graphql";
export default () => {
  throw new GraphQLError("Invalid credentials");
};
```

You can request the error variant by sending:

```
mock_config={"Mutation":{"login":1}}
```

Query variants work the same way. The following cookie picks the "not found" variant for `Query.user`:

```
mock_config={"Query":{"user":1}}
```

### Passthrough example

To fetch data for `Query.user` from the real API while using local mocks for everything else:

```
mock_config={"Query":{"user":-1}}
```

The rest of the query is resolved by the selected mocks.

## Development notes

The server is written in TypeScript and executed via `tsx`.  After modifying the schema or mocks you will need to restart the server.  For contribution guidelines see [AGENTS.md](./AGENTS.md).

## Chrome extension

A simple Chrome extension is provided under `chrome-extension/` for quickly
setting the `mock_config` cookie. It can load the GraphQL schema from the
current page **or** from a local introspection JSON file. The extension
generates inputs for Query and Mutation fields so you can choose variant
numbers. Press **Apply** to write the cookie for the current site.

Load the extension in developer mode by selecting the folder and opening the
popup from the toolbar.
