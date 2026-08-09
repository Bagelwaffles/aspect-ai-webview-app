# Owner login loop troubleshooting

If an AMS owner can complete Google OAuth but protected Command Center pages still return to `/admin/login`, use `/api/operator/session?next=<protected-path>` as the owner elevation path. The route performs the Google-session check and internal-cookie minting together in the Node runtime, avoiding reliance on Edge middleware to bootstrap the operator cookie.
