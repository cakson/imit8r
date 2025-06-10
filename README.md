# Imit8r

Imit8r is a lightweight GraphQL mock server that lets you swap response
variants on demand. Use it during development to mimic different API behaviours
without touching your client code.

## Usage

1. Run `npm install` to install dependencies.
2. Start the server with `npm start` (it listens on port `44361`).

Configuration lives in `config/config.yml`. The required `downstream_url`
points to your real GraphQL endpoint. The optional `mocks` section selects
which variant file to use for each type or field. When no variant is specified
we automatically fall back to `0.ts` if it exists.

You can override these selections per request by sending a `mock_config` cookie
containing a JSON object. Example:

```
mock_config={"Query":{"hello":1,"world":-1}}
```

Numbers pick a variant from the `mocks` directory. Setting a field to `-1`
forwards that part of the request to the downstream server.
