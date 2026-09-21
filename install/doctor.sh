#!/usr/bin/env bash
# Component lifecycle adapter: the verifier is the OMR doctor implementation.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/verify.sh" "$@"
