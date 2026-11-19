#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "$(uname -s)" in
 Linux) platform=linux ;;
 Darwin) platform=mac ;;
 *) echo 'Bu betik yalnız Linux veya macOS üzerinde çalışır.' >&2; exit 1 ;;
esac
if [ "$platform" != "mac" ]; then
 echo 'Bu kaynak klasörü hedef işletim sisteminde derlenmeli.' >&2
 exit 1
fi
npm ci --include=dev
if [ -z "${NODE_HEADERS:-}" ]; then
 node_version="$(node -p 'process.versions.node')"
 mkdir -p .build-tools
 curl --fail --location "https://nodejs.org/dist/v${node_version}/node-v${node_version}-headers.tar.gz" -o .build-tools/node-headers.tar.gz
 tar -xzf .build-tools/node-headers.tar.gz -C .build-tools
 export NODE_HEADERS="$PWD/.build-tools/node-v${node_version}/include/node"
fi
npm run typecheck
npm run build
npm run build:native
node --test tests/*.test.cjs
node node_modules/electron-builder/out/cli/cli.js --config electron-builder.platform.json --"$platform" --"$(node -p process.arch)" --publish never
