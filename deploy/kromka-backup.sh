#!/bin/bash
set -euo pipefail
umask 077
install -d -m 700 /var/backups/kromka
snapshot_dir=$(mktemp -d /var/backups/kromka/.snapshot-XXXXXX)
trap 'rm -rf "$snapshot_dir"' EXIT
/opt/kromka-node/bin/node --env-file=/etc/kromka/push.env /opt/kromka/current/scripts/backup-push.mjs "$snapshot_dir/push.sqlite"
backup_path="/var/backups/kromka/state-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
tar -czf "$backup_path" -C / etc/kromka/app.env etc/kromka/push.env var/lib/kromka/cache -C "$snapshot_dir" push.sqlite
find /var/backups/kromka -maxdepth 1 -type f -name 'state-*.tar.gz' -mmin +10080 -delete
