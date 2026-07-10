# pi-quota-display

Pi extension that shows OpenAI Codex and GitHub Copilot quota in the footer.

## Features

- shows 5h and 1w quota for `openai-codex`
- shows GitHub Copilot daily quota as `quota: used% / goal%`
- uses your existing pi `/login` auth
- only displays quota for the active subscription provider
- refreshes when the session starts and when the agent settles
- does not delay model switching for quota requests

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
- authenticated in pi with `/login` to either:
  - `ChatGPT Plus/Pro (Codex Subscription)`
  - `GitHub Copilot`

## Development

This repo can be symlinked into pi's global extensions directory:

```bash
ln -s /absolute/path/to/quota-display/openai-codex-quota.ts ~/.pi/agent/extensions/openai-codex-quota.ts
```

Then edit the file here and run `/reload` in pi. Changes to quota fetching are performed in the background.
