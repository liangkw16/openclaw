---
title: Lark (Feishu)
description: Connect OpenClaw to Lark/Feishu messaging platform
---

# Lark (Feishu) Channel

Connect your OpenClaw agent to [Lark](https://www.larksuite.com/) (international) or [Feishu](https://www.feishu.cn/) (China) enterprise messaging platform.

## Prerequisites

1. A Lark/Feishu developer account
2. A bot application created in the [Lark Open Platform](https://open.larksuite.com/) or [Feishu Open Platform](https://open.feishu.cn/)
3. Bot capabilities enabled for your application

## Quick Start

### 1. Create a Bot Application

1. Go to [Lark Open Platform](https://open.larksuite.com/app) or [Feishu Open Platform](https://open.feishu.cn/app)
2. Click **Create App** → **Custom App** (企业自建应用)
3. Fill in the app name and description
4. Navigate to **Credentials & Basic Info** (凭证与基础信息) to get your **App ID** and **App Secret**

### 2. Enable Bot Capabilities

1. In your app settings, go to **Add Features** (添加应用能力) → **Bot** (机器人)
2. Enable the bot capability
3. Configure bot settings (name, avatar, description)

### 3. Configure Event Subscription (Important)

For WebSocket mode (recommended), you must configure the event subscription:

1. Go to **Events and Callbacks** (事件与回调)
2. Under **Subscription Mode** (订阅方式), select **Use persistent connection to receive events** (使用长连接接收事件)
3. Add event subscription: `im.message.receive_v1`

### 4. Configure Permissions

Go to **Permissions & Scopes** (权限管理) and add the following permissions:

| Permission | Description |
|------------|-------------|
| `im:message` | Send and receive messages |
| `im:message:send_as_bot` | Send messages as bot |
| `im:chat:readonly` | Read chat information |
| `contact:user.base:readonly` | Read basic user info |

### 5. Publish the App

1. Go to **Version Management & Release** (版本管理与发布)
2. Create a new version and submit for review (or use in development mode for testing)

### 6. Configure OpenClaw

```bash
# Set credentials
openclaw config set channels.lark.appId "cli_your_app_id"
openclaw config set channels.lark.appSecret "your_app_secret"
openclaw config set channels.lark.enabled true

# Optional: Set domain (default is feishu)
openclaw config set channels.lark.domain feishu  # or "lark" for international
```

Or use environment variables:

```bash
export LARK_APP_ID="cli_your_app_id"
export LARK_APP_SECRET="your_app_secret"
```

### 5. Start the Gateway

```bash
openclaw gateway run
```

## Configuration Options

### Basic Configuration

```yaml
channels:
  lark:
    enabled: true
    appId: "cli_xxxxx"
    appSecret: "xxxxx"
    name: "My Lark Bot"
    domain: "feishu"  # or "lark" for international
    mode: "websocket"  # or "webhook"
```

### Full Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the Lark channel |
| `appId` | string | - | Lark App ID (starts with `cli_`) |
| `appSecret` | string | - | Lark App Secret |
| `appIdFile` | string | - | Path to file containing App ID |
| `appSecretFile` | string | - | Path to file containing App Secret |
| `name` | string | - | Display name for the bot account |
| `domain` | string | `"feishu"` | API domain: `"feishu"` or `"lark"` |
| `mode` | string | `"websocket"` | Connection mode: `"websocket"` or `"webhook"` |
| `encryptKey` | string | - | Event encryption key (for webhook mode) |
| `verificationToken` | string | - | Webhook verification token |
| `webhookPath` | string | `"/lark/webhook"` | Custom webhook endpoint path |
| `dmPolicy` | string | `"pairing"` | DM access policy |
| `groupPolicy` | string | `"allowlist"` | Group access policy |
| `allowFrom` | array | `[]` | Allowed user IDs for DMs |
| `groupAllowFrom` | array | `[]` | Allowed user IDs for groups |

## Connection Modes

### WebSocket Mode (Recommended)

WebSocket mode uses Lark's long-polling connection for real-time message receiving. This is the default and recommended mode.

```yaml
channels:
  lark:
    mode: "websocket"
```

**Advantages:**
- No public URL required
- Real-time message delivery
- Automatic reconnection
- Works behind firewalls

**Required Feishu Console Configuration:**

You must configure the subscription mode in Feishu Open Platform:

1. Go to your app → **Events and Callbacks** (事件与回调)
2. Set **Subscription Mode** (订阅方式) to **Use persistent connection** (使用长连接接收事件)
3. Add event: `im.message.receive_v1`

When the gateway starts, you should see:
```
[lark] [default] starting Lark provider (cli_xxx) in websocket mode
[ws] ws connect success
[ws] ws client ready
```

### Webhook Mode

Webhook mode requires a publicly accessible URL for Lark to send events.

```yaml
channels:
  lark:
    mode: "webhook"
    webhookPath: "/lark/webhook"
    encryptKey: "your_encrypt_key"  # Optional but recommended
    verificationToken: "your_token"  # Optional
```

**Setup Steps:**

1. Start the gateway with a public URL:
   ```bash
   openclaw gateway run --port 8080
   ```

2. Expose your gateway to the internet (using ngrok, cloudflare tunnel, etc.):
   ```bash
   ngrok http 8080
   ```

3. In Lark Open Platform, go to **Events and Callbacks** (事件与回调):
   - Set **Subscription Mode** to **Use request URL** (将事件推送至开发者服务器)
   - Set **Request URL** to: `https://your-domain.com/lark/webhook`
   - The platform will send a challenge request to verify the URL
   - Add event: `im.message.receive_v1`

4. (Optional) Enable encryption:
   - Generate an Encrypt Key in the platform
   - Add it to your config: `encryptKey: "your_key"`

**Testing Webhook Locally:**

```bash
# Test health check
curl http://127.0.0.1:18789/lark/webhook
# Returns: OK

# Test URL verification
curl -X POST http://127.0.0.1:18789/lark/webhook \
  -H "Content-Type: application/json" \
  -d '{"type": "url_verification", "challenge": "test"}'
# Returns: {"challenge":"test"}
```

## Multi-Account Setup

You can configure multiple Lark bot accounts:

```yaml
channels:
  lark:
    enabled: true
    # Default account
    appId: "cli_default_app"
    appSecret: "default_secret"

    # Named accounts
    accounts:
      production:
        appId: "cli_prod_app"
        appSecret: "prod_secret"
        name: "Production Bot"
        domain: "lark"

      staging:
        appId: "cli_staging_app"
        appSecret: "staging_secret"
        name: "Staging Bot"
        domain: "feishu"
```

## Access Control

### DM Policy

Control who can send direct messages to the bot:

```yaml
channels:
  lark:
    dmPolicy: "pairing"  # Require approval for new users
    allowFrom:
      - "ou_user_open_id_1"
      - "ou_user_open_id_2"
```

| Policy | Description |
|--------|-------------|
| `open` | Accept messages from anyone |
| `allowlist` | Only accept from users in `allowFrom` |
| `pairing` | Require pairing approval for new users |
| `disabled` | Disable DM entirely |

### Group Policy

Control bot behavior in group chats:

```yaml
channels:
  lark:
    groupPolicy: "allowlist"
    groupAllowFrom:
      - "ou_allowed_user_1"
      - "ou_allowed_user_2"

    groups:
      "oc_specific_chat_id":
        requireMention: true
        systemPrompt: "You are a helpful assistant for this team."
```

| Policy | Description |
|--------|-------------|
| `open` | Respond to all group members |
| `allowlist` | Only respond to users in `groupAllowFrom` |
| `disabled` | Ignore all group messages |

## Sending Messages

### Text Messages

```bash
openclaw message send --to "oc_chat_id" --message "Hello from OpenClaw!"
```

### Programmatic Usage

```typescript
import { sendMessageLark } from "openclaw/lark";

// Send to a chat
await sendMessageLark("oc_chat_id", "Hello!");

// Send to a user (by open_id)
await sendMessageLark("ou_user_open_id", "Hello!");
```

## Message Types

Lark supports various message types:

| Type | Description |
|------|-------------|
| `text` | Plain text messages |
| `post` | Rich text with formatting |
| `image` | Image messages |
| `interactive` | Interactive cards |
| `file` | File attachments |

## Troubleshooting

### Check Connection Status

```bash
openclaw channels status --probe
```

### Verify Credentials

Before starting the gateway, verify your credentials are valid:

```bash
# The gateway will show probe results on startup
openclaw gateway run --verbose
```

Look for these log messages:
```
[lark] [default] starting Lark provider (cli_xxx) in websocket mode
[ws] ws connect success
[ws] ws client ready
```

### Common Issues

**"App ID not configured"**
- Ensure `appId` is set in config or `LARK_APP_ID` environment variable

**"App secret not configured"**
- Ensure `appSecret` is set in config or `LARK_APP_SECRET` environment variable

**"API error: 99991663"**
- Invalid App ID or App Secret
- Check credentials in Lark Open Platform

**"API error: 99991668"**
- Bot capability not enabled
- Go to app settings and enable Bot feature

**WebSocket connects but no messages received**
- Check that event subscription mode is set to "persistent connection" (长连接) in Feishu console
- Verify `im.message.receive_v1` event is subscribed
- Ensure the app is published or in development mode
- Check that you're messaging the bot directly or @mentioning it in a group

**WebSocket connection fails**
- Check network connectivity
- Ensure your IP is not blocked by Lark
- Try webhook mode as alternative

**Webhook verification fails**
- Ensure the webhook URL is publicly accessible
- Check that `encryptKey` matches the one in Lark platform
- Verify the endpoint returns the challenge correctly

**Messages received but no reply**
- Check if Anthropic API key is configured: `openclaw login`
- Look for "No API key found" errors in logs

### Debug Mode

Enable verbose logging:

```bash
openclaw gateway run --verbose
```

### View Logs

```bash
# Gateway log file location is shown on startup
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log
```

## Security Best Practices

1. **Use file-based secrets** for production:
   ```yaml
   channels:
     lark:
       appIdFile: "/secrets/lark-app-id"
       appSecretFile: "/secrets/lark-app-secret"
   ```

2. **Enable encryption** for webhook mode:
   ```yaml
   channels:
     lark:
       encryptKey: "your_encrypt_key"
   ```

3. **Restrict access** with allowlists:
   ```yaml
   channels:
     lark:
       dmPolicy: "allowlist"
       allowFrom: ["ou_trusted_user"]
   ```

4. **Use environment variables** for CI/CD:
   ```bash
   export LARK_APP_ID="cli_xxx"
   export LARK_APP_SECRET="xxx"
   ```

## Incoming Webhooks (Group Notifications)

Lark also supports incoming webhooks for sending messages to groups without a full bot setup. This is useful for notifications and alerts.

### Get Webhook URL

1. Open the target group in Lark/Feishu
2. Go to **Group Settings** → **Bots** → **Add Bot** → **Custom Bot**
3. Copy the webhook URL (format: `https://open.larkoffice.com/open-apis/bot/v2/hook/xxx`)

### Send Messages via Webhook

```bash
# Send text message
curl -X POST "https://open.larkoffice.com/open-apis/bot/v2/hook/YOUR_HOOK_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "msg_type": "text",
    "content": {"text": "Hello from OpenClaw!"}
  }'

# Send interactive card
curl -X POST "https://open.larkoffice.com/open-apis/bot/v2/hook/YOUR_HOOK_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "msg_type": "interactive",
    "card": {
      "header": {
        "title": {"tag": "plain_text", "content": "Alert"},
        "template": "red"
      },
      "elements": [
        {"tag": "div", "text": {"tag": "lark_md", "content": "**Status:** Error detected"}}
      ]
    }
  }'
```

## API Reference

### Lark Open Platform Documentation

- [Lark Open Platform (International)](https://open.larksuite.com/document)
- [Feishu Open Platform (China)](https://open.feishu.cn/document)
- [Bot Webhook Guide](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot)

### OpenClaw Lark SDK

The Lark channel exposes these functions via the plugin runtime:

| Function | Description |
|----------|-------------|
| `sendMessageLark` | Send text message |
| `replyMessageLark` | Reply to a message |
| `sendImageLark` | Send image message |
| `sendInteractiveCardLark` | Send interactive card |
| `sendPostLark` | Send rich text post |
| `uploadImageLark` | Upload image and get image_key |
| `probeLarkBot` | Verify bot credentials |

### ID Formats

| ID Type | Format | Example |
|---------|--------|---------|
| App ID | `cli_` + alphanumeric | `cli_a9f6c72aa7b85bca` |
| Chat ID | `oc_` + alphanumeric | `oc_62f029a341924f299a9cccf08b65eafa` |
| Open ID (User) | `ou_` + alphanumeric | `ou_686b51d46cc2ea20062da3e6deae2c66` |
| Message ID | `om_` + alphanumeric | `om_x100b58dba500c8a4c2d4140bc74497e` |
