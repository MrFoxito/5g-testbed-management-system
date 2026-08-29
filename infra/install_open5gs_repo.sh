#!/usr/bin/env bash
set -euo pipefail

OPEN5GS_KEY_URL='https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xACC46E8E238249B1'
OPEN5GS_KEYRING='/usr/share/keyrings/open5gs-ppa.gpg'
OPEN5GS_LIST='/etc/apt/sources.list.d/open5gs-latest.list'

rm -f /etc/apt/sources.list.d/open5gs-latest.list
rm -f /usr/share/keyrings/open5gs-ppa.gpg

curl -fsSL "$OPEN5GS_KEY_URL" | gpg --dearmor > "$OPEN5GS_KEYRING"

printf '%s\n' "deb [signed-by=$OPEN5GS_KEYRING] https://ppa.launchpadcontent.net/open5gs/latest/ubuntu jammy main" \
  > "$OPEN5GS_LIST"

apt update
