#!/usr/bin/env bash
set -euo pipefail
: "${RUNNER_TOOL_CACHE:?Runner cache required}"
: "${GITHUB_PATH:?GitHub path required}"
workbench_node_bin="${RUNNER_TOOL_CACHE}/node/24.20.0/x64/bin"
test -x "${workbench_node_bin}/node"
test -x "${workbench_node_bin}/npm"
export PATH="${workbench_node_bin}:${PATH}"
test "$(node --version)" = v24.20.0
printf '%s\n' "${workbench_node_bin}" >> "${GITHUB_PATH}"
