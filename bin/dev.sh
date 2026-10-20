#!/usr/bin/env sh
#
# Sandbox do app em desenvolvimento.
#
# O app instalado e o app de dev **não podem compartilhar dados**, e o motivo
# é a cifra: a biblioteca (`library.enc`) e as capas são cifrados com a
# chave-mestra do cofre. Dev com o cofre de `/var/lib` e a biblioteca de
# `~/.local/share` casaria — mas o inverso (cofre novo do dev, acervo do app
# instalado) é ilegível: a biblioteca virava `libraryTampered` na cara de
# quem não adulterou nada, e o acervo real ficava fora do alcance do dev.
#
# Por isso o sandbox é **completo**: o cofre (`CRONOLOGIA_VAULT_DIR`) e as três
# pastas XDG (dados, configuração e cache) apontam para dentro do repositório.
# `.dev-vault` fica à parte porque é o cofre, não um dado XDG.
#
# Nada aqui toca `/var/lib` nem dispara `pkexec`: o dev nunca pede a caixinha
# de senha do sistema para abrir o cofre de sandbox.
#
# Uso: bin/dev.sh [--inspect 5858] [--inspectBrk 5858]

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Cofre de sandbox: chave-mestra própria, longe do cofre do app instalado.
export CRONOLOGIA_VAULT_DIR="$ROOT/.dev-vault"

# Dados, configuração e cache de sandbox: o acervo, as settings e o cache do
# Chromium do dev não encostam nos do app instalado.
export XDG_DATA_HOME="$ROOT/.dev-home/.local/share"
export XDG_CONFIG_HOME="$ROOT/.dev-home/.config"
export XDG_CACHE_HOME="$ROOT/.dev-home/.cache"

# Log do Chromium no terminal (GPU, rede, sandbox).
export ELECTRON_ENABLE_LOGGING=1

exec electron-vite dev "$@"
