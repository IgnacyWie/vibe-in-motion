#!/usr/bin/env bash

set -euo pipefail

LABEL="com.ignacy.vibe-in-motion"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_PATH="$REPO_ROOT/deploy/$LABEL.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$LAUNCH_AGENTS_DIR/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs"
SERVICE_ID="gui/$(id -u)/$LABEL"

main() {
  local command="${1:-install}"

  case "$command" in
    install)
      install_service
      ;;
    restart)
      restart_service
      ;;
    stop)
      stop_service
      ;;
    status)
      print_status
      ;;
    logs)
      print_logs
      ;;
    *)
      print_usage
      exit 1
      ;;
  esac
}

install_service() {
  require_command node
  require_command pnpm
  require_command launchctl

  mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR" "$REPO_ROOT/data"

  echo "Installing dependencies"
  (cd "$REPO_ROOT" && pnpm install --frozen-lockfile)

  echo "Building app"
  (cd "$REPO_ROOT" && pnpm build)

  echo "Rendering launchd plist"
  render_plist > "$TARGET_PLIST"

  echo "Reloading launchd service"
  stop_service >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$TARGET_PLIST"
  launchctl enable "$SERVICE_ID"
  launchctl kickstart -k "$SERVICE_ID"

  echo "Service installed: $SERVICE_ID"
  echo "Plist: $TARGET_PLIST"
  echo "Check status with: bash scripts/deploy-mac.sh status"
  echo "Check logs with:   bash scripts/deploy-mac.sh logs"
}

restart_service() {
  require_command launchctl
  launchctl kickstart -k "$SERVICE_ID"
  echo "Service restarted: $SERVICE_ID"
}

stop_service() {
  require_command launchctl

  if launchctl print "$SERVICE_ID" >/dev/null 2>&1; then
    launchctl bootout "$SERVICE_ID"
    echo "Service stopped: $SERVICE_ID"
    return
  fi

  if [ -f "$TARGET_PLIST" ]; then
    launchctl bootout "gui/$(id -u)" "$TARGET_PLIST" >/dev/null 2>&1 || true
  fi
}

print_status() {
  require_command launchctl
  launchctl print "$SERVICE_ID"
}

print_logs() {
  mkdir -p "$LOG_DIR"
  touch "$LOG_DIR/vibe-in-motion.log" "$LOG_DIR/vibe-in-motion.error.log"
  tail -f "$LOG_DIR/vibe-in-motion.log" "$LOG_DIR/vibe-in-motion.error.log"
}

render_plist() {
  local node_bin
  local process_path
  local pnpm_home
  node_bin="$(command -v node)"
  process_path="$(build_process_path)"
  pnpm_home="${PNPM_HOME:-$HOME/Library/pnpm}"

  if [ ! -f "$TEMPLATE_PATH" ]; then
    echo "Missing plist template: $TEMPLATE_PATH" >&2
    exit 1
  fi

  sed \
    -e "s|__NODE_BIN__|$(escape_sed_replacement "$node_bin")|g" \
    -e "s|__PROCESS_PATH__|$(escape_sed_replacement "$process_path")|g" \
    -e "s|__PNPM_HOME__|$(escape_sed_replacement "$pnpm_home")|g" \
    -e "s|__REPO_ROOT__|$(escape_sed_replacement "$REPO_ROOT")|g" \
    -e "s|__HOME_DIR__|$(escape_sed_replacement "$HOME")|g" \
    "$TEMPLATE_PATH"
}

build_process_path() {
  local pnpm_home
  pnpm_home="${PNPM_HOME:-$HOME/Library/pnpm}"
  printf '%s' "${PATH}:$pnpm_home:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[&|]/\\&/g'
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

print_usage() {
  cat <<'EOF'
Usage: bash scripts/deploy-mac.sh [install|restart|stop|status|logs]

install  Install dependencies, build, render the plist, and reload launchd
restart  Restart the existing launchd service
stop     Stop and unload the existing launchd service
status   Print launchd status
logs     Tail stdout and stderr logs
EOF
}

main "$@"
