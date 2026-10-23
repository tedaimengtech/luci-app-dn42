#!/bin/sh
# Run local checks without downloading an SDK or touching router configuration.
set -eu
cd "$(dirname "$0")/.."
for tool in python3 lua luac node; do
    command -v "$tool" >/dev/null 2>&1 || {
        echo "Missing check dependency: $tool" >&2
        exit 1
    }
done
luac -p root/usr/libexec/rpcd/luci.dn42
for file in htdocs/luci-static/resources/view/dn42/*.js; do
    node --check "$file"
done
for file in root/usr/libexec/dn42/* scripts/*.sh; do
    sh -n "$file"
done
python3 - <<'PY'
import json
from pathlib import Path
for path in Path('root').rglob('*.json'):
    json.loads(path.read_text())
    print(f'JSON OK: {path}')
PY
python3 -m unittest discover -s tests -v
