#!/usr/bin/env sh
# Happy Hare Console
#
# Serve the Console (the viewer/ folder of this checkout) from an nginx site of its own, beside
# Mainsail/Fluidd, and register the checkout with Moonraker's update manager.
#
# The site shares no files with other web UIs, so removing it never affects them.
# Only the few commands that need root use sudo.
#
# Environment (for testing and unusual layouts):
#   NGINX_DIR (/etc/nginx)  NGINX_BIN (nginx)  NGINX_ARGS (extra args for nginx -t)
#   SUDO (sudo, or empty when root)  NO_RELOAD (skip the reload)  VIEWER_DIR (folder to serve)
#   MOONRAKER_CONF (moonraker.conf to register with)
#
HERE=$(cd "$(dirname "$0")" && pwd -P)
NGINX_DIR="${NGINX_DIR:-/etc/nginx}"
NGINX_BIN="${NGINX_BIN:-nginx}"
VIEWER_DIR="${VIEWER_DIR:-${HERE}/viewer}"
CONFIG_DIR="${HOME}/printer_data/config"
UPSTREAM_PORT=7125
FIRST_PORT=8090
PORT_GIVEN=
ACTION=install
NAME=happy-hare-console
SITE="${NGINX_DIR}/sites-available/${NAME}"
LINK="${NGINX_DIR}/sites-enabled/${NAME}"
SECTION="[update_manager ${NAME}]"
if [ -z "${SUDO+x}" ]; then
    if [ "$(id -u)" = 0 ]; then SUDO=; else SUDO=sudo; fi
fi

say() { echo "$*"; }
fail() { echo "$*" >&2; exit 1; }

usage() {
    echo "Usage: $0 [options]"
    echo "  (no options) serve the Console from this printer and register it for updates"
    echo "  -u uninstall: remove the nginx site and the update manager entry"
    echo "  -p <port> first port to try for the Console (default ${FIRST_PORT})"
    echo "  -m <port> Moonraker's port (default ${UPSTREAM_PORT})"
    echo "  -c <dir> non-default klipper config directory (holding moonraker.conf)"
    echo "  -y automatically answer yes to all y/n prompts"
    exit "${1:-0}"
}

have_nginx() {
    [ -d "${NGINX_DIR}/sites-available" ] && [ -d "${NGINX_DIR}/sites-enabled" ] &&
        command -v "${NGINX_BIN}" >/dev/null 2>&1
}

# Ports other sites already listen on, one per line (ours excluded)
used_ports() {
    for f in "${NGINX_DIR}/nginx.conf" "${NGINX_DIR}"/conf.d/*.conf "${NGINX_DIR}"/sites-enabled/*; do
        [ -f "${f}" ] || continue
        [ "$(basename "${f}")" = "${NAME}" ] && continue
        sed -n 's/^[[:space:]]*listen[[:space:]]\{1,\}\(\[[^]]*\]:\)\{0,1\}\([0-9]\{1,\}\).*/\2/p' "${f}"
    done
}

choose_port() {
    if [ -z "${PORT_GIVEN}" ] && [ -f "${SITE}" ]; then
        port=$(sed -n 's/^[[:space:]]*listen[[:space:]]\{1,\}\([0-9]\{1,\}\);.*/\1/p' "${SITE}" | head -n 1)
        [ -n "${port}" ] && { echo "${port}"; return; }
    fi
    taken=$(used_ports)
    port=${FIRST_PORT}
    while echo "${taken}" | grep -qx "${port}"; do port=$((port + 1)); done
    echo "${port}"
}

render() { # <viewer_dir> <port>
    sed -e "s#%ROOT%#$1#g" -e "s#%PORT%#$2#g" -e "s#%UPSTREAM%#${UPSTREAM_PORT}#g" "${HERE}/nginx/${NAME}.conf"
}

reload_nginx() {
    [ -n "${NO_RELOAD:-}" ] && return 0
    ${SUDO} systemctl reload nginx 2>/dev/null || ${SUDO} "${NGINX_BIN}" -s reload
}

check_readable() { # <viewer_dir>
    user=$(sed -n 's/^[[:space:]]*user[[:space:]]\{1,\}\([A-Za-z0-9_.-]\{1,\}\).*/\1/p' "${NGINX_DIR}/nginx.conf" 2>/dev/null | head -n 1)
    user=${user:-www-data}
    id "${user}" >/dev/null 2>&1 || return 0
    if ! ${SUDO} -u "${user}" test -r "$1/index.html" 2>/dev/null; then
        say "nginx (user '${user}') cannot read $1. Usually the home directory is private;" \
            "allow it to be traversed with:  chmod o+x ~"
    fi
}

address() {
    host=$(hostname -I 2>/dev/null | awk '{print $1}')
    echo "${host:-$(hostname)}"
}

confirm() {
    [ -n "${F_YES:-}" ] && return 0
    printf '%s [y/N] ' "$1"
    read -r yn || return 1
    case "${yn}" in y | Y | yes) return 0 ;; *) return 1 ;; esac
}

update_entry() {
    origin=$(git -C "${HERE}" remote get-url origin 2>/dev/null)
    echo "${SECTION}"
    echo "type: git_repo"
    echo "path: ${HERE}"
    echo "origin: ${origin:-https://github.com/moggieuk/Happy-Hare-Console.git}"
    echo "primary_branch: main"
    echo "is_system_service: False"
}

register_updates() {
    if [ ! -f "${MOONRAKER_CONF}" ]; then
        say "No ${MOONRAKER_CONF}. To update the Console from Mainsail/Fluidd, add this to moonraker.conf:"
        update_entry
        return 0
    fi
    grep -qxF "${SECTION}" "${MOONRAKER_CONF}" && return 0
    { echo; update_entry; } >>"${MOONRAKER_CONF}"
    say "Added ${SECTION} to ${MOONRAKER_CONF}. Restart Moonraker to see the Console in the update manager."
}

unregister_updates() {
    [ -f "${MOONRAKER_CONF}" ] && grep -qxF "${SECTION}" "${MOONRAKER_CONF}" || return 0
    tmp=$(mktemp) || fail "Cannot create a temporary file"
    awk -v section="${SECTION}" '
        $0 == section { skip = 1; blank = ""; next }
        skip && /^\[/ { skip = 0 }
        skip { next }
        /^[[:space:]]*$/ { blank = blank $0 "\n"; next }
        { printf "%s", blank; blank = ""; print }
        END { printf "%s", blank }
    ' "${MOONRAKER_CONF}" >"${tmp}" && cat "${tmp}" >"${MOONRAKER_CONF}"
    rm -f "${tmp}"
    say "Removed ${SECTION} from ${MOONRAKER_CONF}."
}

do_install() {
    viewer=${VIEWER_DIR}
    [ -f "${viewer}/index.html" ] || fail "No Console found at ${viewer}"
    if ! have_nginx; then
        say "The Console needs a web server and nginx was not found (or is not laid out like a Debian install)."
        say "See README.md: 'Other ways to host it' for installing nginx or serving the folder yourself."
        return 0
    fi
    port=$(choose_port)
    say "Serving ${viewer} on port ${port}, proxying Moonraker on port ${UPSTREAM_PORT}."
    confirm "This uses sudo to write ${SITE} and reload nginx. Continue?" || { say "Nothing changed."; return 0; }
    tmp=$(mktemp) || fail "Cannot create a temporary file"
    render "${viewer}" "${port}" >"${tmp}"
    previous=
    if [ -f "${SITE}" ]; then previous=$(mktemp); cp "${SITE}" "${previous}"; fi
    ${SUDO} cp "${tmp}" "${SITE}" && ${SUDO} ln -sf "${SITE}" "${LINK}" || { rm -f "${tmp}" "${previous}"; fail "Unable to write the nginx site"; }
    rm -f "${tmp}"
    if ! output=$(${SUDO} "${NGINX_BIN}" ${NGINX_ARGS:-} -t 2>&1); then
        if [ -n "${previous}" ]; then ${SUDO} cp "${previous}" "${SITE}"; else ${SUDO} rm -f "${LINK}" "${SITE}"; fi
        rm -f "${previous}"
        echo "${output}" >&2
        fail "nginx rejected the configuration, so nothing was changed."
    fi
    rm -f "${previous}"
    reload_nginx || fail "nginx could not be reloaded"
    check_readable "${viewer}"
    register_updates
    say "The Console is at http://$(address):${port}/"
}

do_remove() {
    unregister_updates
    [ -e "${SITE}" ] || [ -L "${LINK}" ] || return 0
    say "Removing the Console's nginx site."
    ${SUDO} rm -f "${LINK}" "${SITE}"
    if output=$(${SUDO} "${NGINX_BIN}" ${NGINX_ARGS:-} -t 2>&1); then
        reload_nginx
    else
        echo "${output}" >&2
    fi
}

while getopts "uyhp:m:c:" arg; do
    case ${arg} in
    u) ACTION=remove ;;
    y) F_YES=y ;;
    p) FIRST_PORT=${OPTARG} PORT_GIVEN=y ;;
    m) UPSTREAM_PORT=${OPTARG} ;;
    c) CONFIG_DIR=${OPTARG} ;;
    h) usage ;;
    *) usage 1 ;;
    esac
done
for number in "${FIRST_PORT}" "${UPSTREAM_PORT}"; do
    case ${number} in '' | *[!0-9]*) fail "A port must be a number, not '${number}'" ;; esac
done
MOONRAKER_CONF="${MOONRAKER_CONF:-${CONFIG_DIR}/moonraker.conf}"

case ${ACTION} in
install) do_install ;;
remove) do_remove ;;
esac
