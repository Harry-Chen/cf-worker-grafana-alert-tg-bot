# CF Worker thats forwards Grafana alerting to Telegram

This tool would be useful if your Grafana instance cannot access telegram API.

## Usage

```
cp wrangler.example.toml wrangler.toml
vim wrangler.toml # put your own worker ID and account ID
wrangler secret put BOT_TOKEN # telegram bot token
wrangler secret put TG_CHAT_IDS # chat IDs to send alert to (split by comma)
wrangler secret put WEBHOOK_TOKEN # to authenticate against grafana
wrangler deploy
```

Then config you Grafana alerting webhook to `https://<your-worker>.workers.dev/` with authentication token `WEBHOOK_TOKEN`.
