# pi-openai-codex-quota-display

Pi extension that shows your OpenAI Codex subscription quota in the footer.

## Features

- shows 5h and 1w quota for `openai-codex`
- uses your existing pi `/login` auth
- only displays when the active model is using the OpenAI Codex subscription
- refreshes when the session starts, the model changes, and when the agent settles

## Install

From git:

```bash
pi install git:github.com/fxwin/quota-display
```

Or from a local checkout:

```bash
pi install /absolute/path/to/quota-display
```

Then run:

```bash
/reload
```

## Requirements

- pi installed
- authenticated in pi with `/login` to `ChatGPT Plus/Pro (Codex Subscription)`

## Development

This repo can be symlinked into pi's global extensions directory:

```bash
ln -s /absolute/path/to/quota-display/openai-codex-quota.ts ~/.pi/agent/extensions/openai-codex-quota.ts
```

Then edit the file here and run `/reload` in pi.
