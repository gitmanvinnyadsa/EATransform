# Activating AI features — beginner-friendly guide

EATransform works out of the box **without any API key**: a built-in offline
"demo analyst" powers every AI feature so you can try the whole product.
To get real AI analysis tailored to your exact wording, connect an AI
provider. It takes about 3 minutes.

## Step 1 — Get an API key (Google Gemini, free tier)

1. Go to <https://aistudio.google.com/apikey>
2. Sign in with a Google account.
3. Click **Create API key** and copy the key (a long string like `AIza…`).

Gemini is recommended to start because it has a free development tier.
Anthropic Claude and OpenAI keys work too — see Step 3.

## Step 2 — Add the key to the application

1. In the project folder, find the file **`.env.example`**.
2. Make a copy of it and name the copy **`.env`** (exactly that, starting
   with a dot, in the project root folder).
3. Open `.env` in any text editor and paste your key after `AI_API_KEY=`:

   ```
   AI_PROVIDER=gemini
   AI_API_KEY=AIzaSyYourKeyHere
   ```

4. Save the file.

> Your key stays on your machine. It is never sent anywhere except directly
> to the AI provider, and it is never stored in the database or in exports.
> `.env` is ignored by git, so it can't be committed by accident.

## Step 3 — (Optional) use Groq, Claude, or OpenAI instead

Only the configuration changes — no code.

**Groq** — a second free option, faster and with more generous limits than
Gemini's free tier (get a key at <https://console.groq.com/keys>):

```
AI_PROVIDER=groq
AI_API_KEY=gsk_…
```

**Claude** (paid — add credit at <https://console.anthropic.com/>):

```
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-…
```

**OpenAI** (paid):

```
AI_PROVIDER=openai
AI_API_KEY=sk-…
```

You can also pin a specific model with `AI_MODEL=` (defaults:
`gemini-2.0-flash`, `llama-3.3-70b-versatile`, `claude-sonnet-5`,
`gpt-4o-mini`).

## Step 4 — Restart the application

Stop the app (Ctrl+C in the terminal) and start it again:

```
npm run dev
```

The terminal will print `AI provider: gemini (gemini-2.0-flash)` when the key
is loaded. In the app, **Settings** shows a green **Active** badge.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Settings still says "Not configured" | The `.env` file must be in the project **root** (next to `.env.example`), and the app must be restarted after editing it. |
| "API error 401/403" | The key is wrong or was revoked — create a new one and paste it again. |
| "API error 404 — model not found" | Remove `AI_MODEL` from `.env` or set it to a model your account can use. |
| "API error 429" | Free-tier rate limit — wait a minute and try again. |
| AI replies say "offline demo analyst" | The provider was unreachable; the app automatically fell back so you could keep working. Check your internet connection and key. |

## What happens without a key?

Everything runs. The demo analyst can generate example maps from your
industry keywords, apply common edits ("add X before Y", "remove X",
"split LANE into 3 teams", "reduce approvals", "highlight bottlenecks",
"create an executive summary"), and write insight reviews from the built-in
deterministic analysis engine. The difference with a real key: the AI
understands *any* phrasing and tailors the model precisely to your business.
