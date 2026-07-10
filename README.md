# pi-quota-display

[Pi](https://pi.dev) extension that shows your OpenAI Codex or GitHub Copilot quota in the footer.

## Features

- shows Codex 5h and 1w quota
- shows GitHub Copilot quota as used vs. goal
- follows your currently active model/provider
- uses your existing pi `/login`
- refreshes in the background without slowing model switches

## Setup

1. Install the extension:

```bash
pi install git:github.com/fxwin/quota-display
```

Or from a local checkout:

```bash
pi install /absolute/path/to/quota-display
```

2. Reload pi:

```bash
/reload
```

3. Make sure you're logged in with `/login` for one or both of:
   - ChatGPT Plus/Pro (Codex Subscription)
   - GitHub Copilot
