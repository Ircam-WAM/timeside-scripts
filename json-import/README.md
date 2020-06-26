## Timeside import CLI

This tool aims to import files from JSON files.

### Requirements

- Credentials for Timeside API
- Node.JS (tested on v13.14 but may work on previous versions)

### Install node dependencies

```
npm run install
```

### Configure your environment variables

First, you have to configure environment variables with your Timeside credentials.

```bash
cp .env.example .env
$EDITOR .env
```

### Configure your input.json file

See some examples in samples/*.json.

### Run the import

Provide the json file as your first parameter.

```bash
npm run start samples/youtube.json
```
