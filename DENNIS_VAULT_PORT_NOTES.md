# Dennis Vault Port Notes

## Why This Client Is Interesting

KeePassXC-Browser already separates page integration from secret storage. Content scripts detect
fields, fill forms, show icons, watch submitted forms, and ask the background service for logins.
The background service then talks to KeePassXC over native messaging.

For Dennis Vault, that boundary can become:

```text
content scripts / popup / banners
        |
background/page.js + background/keepass.js
        |
Dennis broker HTTP API + OTP prompt
```

## Primary Insertion Points

| File | Current role | Dennis Vault change |
| --- | --- | --- |
| `keepassxc-browser/background/keepass.js` | Central credential API: `retrieveCredentials`, `addCredentials`, `updateCredentials`, database state, association. | Replace native KeePassXC actions with broker calls. Preserve return shape expected by popup/content scripts. |
| `keepassxc-browser/background/client.js` | Native messaging, encryption, request buffering to `org.keepassxc.keepassxc_browser`. | Remove or bypass for broker mode. No native host needed. |
| `keepassxc-browser/background/event.js` | Runtime message router from content/popup to background actions. | Keep mostly intact; point actions to broker-backed functions. |
| `keepassxc-browser/background/page.js` | Tab state and `retrieveCredentials` orchestration. | Keep; adapt database states to "locked until OTP". |
| `keepassxc-browser/content/*.js` | Field detection, icons, fill, save banner, TOTP UI. | Keep heavily; this is the valuable browser integration layer. |
| `keepassxc-browser/popups/*` | Manual credential selection and fill UI. | Keep/modify labels and unlock flow. |

## Broker Mapping

| KeePassXC action | Dennis broker endpoint |
| --- | --- |
| `get-logins` | `POST /secrets/read-domain` with `{ domain, otp_code }` |
| `set-login` new | `POST /secrets/save-login` |
| `set-login` update | Needs backend update semantics or save-as-new policy. |
| `get-totp` | Not supported yet. |
| groups/database association | Remove; replace with broker URL + OTP/session state. |
| passkeys | Defer; separate protocol. |

## Difficulty

Medium. This is likely the best browser-extension base because page integration is already separate
from the secret authority. The largest work is replacing database/association state with a Dennis
Vault unlock/session model and ensuring the returned login objects match the fields expected by
`fill.js`, popup lists, and banners.
