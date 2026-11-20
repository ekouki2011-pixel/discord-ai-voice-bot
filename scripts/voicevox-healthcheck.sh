#!/bin/bash
set -eu
# Official image has Bash; no extra curl/Python package is required.
exec 3<>/dev/tcp/127.0.0.1/50021
printf 'GET /version HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n' >&3
IFS= read -r status <&3
[[ "$status" == *" 200 "* ]]
