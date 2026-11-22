#!/bin/sh
set -eu
: "${DISCORD_TOKEN:?Set DISCORD_TOKEN in Koyeb Secrets}"
: "${DISCORD_CLIENT_ID:?Set the Discord application ID}"
: "${DISCORD_GUILD_ID:?Set the Discord server ID}"
install -d -m 700 -o node -g node /mnt/bot/state
exec setpriv --reuid=node --regid=node --init-groups --no-new-privs sh -ec 'node dist/scripts/register.js && exec node dist/index.js'
