#!/usr/bin/env bash
# Bootstrap: baixa o QA Agent do GitHub e roda o instalador local.
# Uso remoto (uma linha):
#   curl -fsSL https://raw.githubusercontent.com/ErickGomesSilva/qa-agent/main/install.sh | bash
set -euo pipefail

REPO="${QA_AGENT_REPO:-ErickGomesSilva/qa-agent}"
BRANCH="${QA_AGENT_BRANCH:-main}"
INSTALL_DIR="${QA_AGENT_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/qa-agent}"
MIN_NODE_MAJ=22
MIN_NODE_MIN=13

info() { printf '%s\n' "$*"; }
fail() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e "
    const [a,b]=process.versions.node.split('.').map(Number);
    process.exit(a>22||(a===22&&b>=13)?0:1);
  " 2>/dev/null
}

need_node() {
  fail "Node.js >= ${MIN_NODE_MAJ}.${MIN_NODE_MIN} é obrigatório. Instale em https://nodejs.org e rode de novo."
}

need_curl() {
  command -v curl >/dev/null 2>&1 || fail "curl não encontrado. Instale curl ou clone o repositório manualmente."
}

need_tar() {
  command -v tar >/dev/null 2>&1 || fail "tar não encontrado."
}

sync_tree() {
  local src="$1"
  local dest="$2"
  mkdir -p "$dest"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude node_modules \
      --exclude .env \
      --exclude data \
      "$src/" "$dest/"
  else
    find "$dest" -mindepth 1 -maxdepth 1 \
      ! -name node_modules ! -name .env ! -name data \
      -exec rm -rf {} +
    tar -C "$src" -cf - \
      --exclude=node_modules --exclude=.env --exclude=data . \
      | tar -C "$dest" -xf -
  fi
}

download_and_sync() {
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  local url="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz"
  info "Baixando ${REPO} (${BRANCH})..."
  curl -fsSL "$url" -o "$tmp/qa-agent.tar.gz"
  tar -xzf "$tmp/qa-agent.tar.gz" -C "$tmp"
  local extracted="$tmp/qa-agent-${BRANCH}"
  [[ -d "$extracted" ]] || extracted="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -1)"
  [[ -f "$extracted/instalar.mjs" ]] || fail "Pacote inválido (instalar.mjs ausente)."
  sync_tree "$extracted" "$INSTALL_DIR"
}

main() {
  info "QA Agent — instalador remoto (Linux/macOS)"
  info "Pasta de instalação: $INSTALL_DIR"
  info ""

  need_curl
  need_tar
  node_ok || need_node

  if [[ -f "$INSTALL_DIR/instalar.mjs" ]]; then
    info "Instalação existente — atualizando código (preserva .env e data/)..."
    download_and_sync
  else
    info "Primeira instalação..."
    download_and_sync
  fi

  cd "$INSTALL_DIR"
  node instalar.mjs
}

main "$@"
