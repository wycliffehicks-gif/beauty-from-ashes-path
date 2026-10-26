# P3b sign-in blocker: what is possible from the "Enable authentication" screen

Read-only findings. Nothing was changed.

## Findings

1. **What "Enable authentication" does.** I couldn't confirm it.
   - The official docs only say it enables the app's built-in sign-in. They don't say what it does when no sign-in method is on.
   - The card's own text ("Ask Lovable to set up authentication and build your login experience") suggests it hands the request to chat to build a login flow, rather than opening a settings panel. That is a guess from the card text, not something I verified.
   - The docs also don't say whether Settings appears before any sign-in method is on. Your screenshot shows it doesn't. Pressing the button should be treated as a change that could start a build, not as opening a menu.

2. **Changing only the sign-up switch while keeping the leaked-password (HIBP) value.** Not possible.
   - The only tool that changes sign-up must set four values in the same call: sign-up off, auto-confirm, anonymous sign-in and the leaked-password check. It has no "leave unchanged" option for the leaked-password check.
   - None of my tools reads the current leaked-password value, and that screen is the place you would see it, but your screen doesn't show it. So the current value can't be kept without guessing.
   - The tool that turns on email sign-in doesn't touch the sign-up switch. Using it now, while public sign-up is on, would open sign-up to the public. That breaks your condition, so I won't use it first.

3. **What is left to decide.** This isn't a support issue. The leaked-password check just has to be set to a value you choose, instead of keeping an unknown one. Turning it **ON** is the stricter, safer choice: it only rejects passwords already known to be leaked, and it doesn't affect anything else you set.

## The one next step (needs your yes)

Approve setting the leaked-password check to **ON** in the same change that turns public sign-up off. After that, I'll run the sequence you already approved:

1. One settings change: public sign-up OFF, leaked-password check ON, auto-confirm OFF, anonymous sign-in OFF.
2. Read the settings back to confirm sign-up is closed before anything else.
3. Turn on email sign-in. Public sign-up stays closed.
4. Create fictional A, B and C as confirmed accounts with no emails sent. Admit only A and B to staging, with an expiry date. Run the signed-in checks (O01 to O08).
5. Delete A, B and C, remove staging access and turn email sign-in back off. The leaked-password check stays ON unless you say otherwise.

These stay the same throughout:
- Your personal account isn't used.
- Nothing is published.
- Participant AI and voice stay off.
- I won't retry the actions that were refused before, or use workarounds.

## Technical details

- The settings tool requires `disable_signup`, `auto_confirm_email`, `password_hibp_enabled` and `external_anonymous_users_enabled` in every call. The planned values are `true`, `false`, `true` and `false`.
- The email sign-in tool takes no parameters and leaves the sign-up switch unchanged. That is why it runs only after step 2 confirms sign-up is closed.
- Sources: platform knowledge on auth settings (agent vs owner controls), official docs "Users and authentication" and "Email authentication: password rules", and the tool definitions available in this session.
