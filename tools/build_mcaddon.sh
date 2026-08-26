#!/usr/bin/env bash
# Package the behavior + resource packs into importable Bedrock files.
#   dist/ChocobosBP.mcpack             (behavior pack only)
#   dist/ChocobosRP.mcpack             (resource pack only)
#   dist/ChocobosAndChickabos.mcaddon  (both — recommended, one tap to import)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DIST="$ROOT/dist"
rm -rf "$DIST"
mkdir -p "$DIST"

ZIP_EXCLUDES=( -x "*.DS_Store" -x "__MACOSX*" -x "*/.gitkeep" )

echo "Building .mcpack files..."
( cd Chocobos_BP && zip -r -q "$DIST/ChocobosBP.mcpack" . "${ZIP_EXCLUDES[@]}" )
( cd Chocobos_RP && zip -r -q "$DIST/ChocobosRP.mcpack" . "${ZIP_EXCLUDES[@]}" )

echo "Building combined .mcaddon..."
zip -r -q "$DIST/ChocobosAndChickabos.mcaddon" Chocobos_BP Chocobos_RP "${ZIP_EXCLUDES[@]}"

echo "Done. Artifacts in dist/:"
ls -lh "$DIST"
