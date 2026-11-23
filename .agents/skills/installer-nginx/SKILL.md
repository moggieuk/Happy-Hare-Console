---
name: installer-nginx
description: Explains the Happy Hare Console's installer — install.sh, the nginx site it writes from nginx/happy-hare-console.conf, the port choice, the rollback when nginx rejects a configuration, the [update_manager happy-hare-console] entry in moonraker.conf, and how test/test_install.py exercises all of it with a stub nginx and no root. Use this whenever touching install.sh, the nginx template, test/test_install.py or the install section of README.md, adding an install option, or debugging a 403, a port clash or a Console missing from the Mainsail/Fluidd update list.
---

# Installer and nginx site

`./install.sh` makes the Console available on a printer the way Mainsail and Fluidd are: an nginx
site, plus an entry in Moonraker's update manager. `./install.sh -u` removes both.

## What it does, in order

1. Finds nginx laid out the Debian way (`sites-available`, `sites-enabled`). If it is missing the
   script says so, changes nothing and exits 0.
2. Chooses a port: the one its existing site already uses, else the first free port from 8090,
   skipping every `listen` port in `nginx.conf`, `conf.d/*.conf` and `sites-enabled/*`. `-p` starts
   the search from another port and replaces the one in use.
3. Asks before using `sudo` (`-y` skips the question).
4. Renders `nginx/happy-hare-console.conf` (`%ROOT%`, `%PORT%`, `%UPSTREAM%`) into
   `sites-available/happy-hare-console` and links it into `sites-enabled`.
5. Runs `nginx -t`. On failure it restores the previous site, or removes the new one, and exits
   non-zero. Only then does it reload nginx.
6. Appends `[update_manager happy-hare-console]` to `moonraker.conf` if it is not already there. With
   no `moonraker.conf` it prints the section for the user to add.

## Decisions

- **The site proxies Moonraker** (`/websocket` and the API paths) so the page and the API share an
  origin. That is why no `cors_domains` entry is needed and why the page's default connection
  address is its own origin.
- **The update manager type is `git_repo`,** not `web`. There is no build step, so the site serves
  the checkout and an update is a `git pull`. Moonraker reports a checkout with local changes as dirty, so
  the installer must never write inside the repository.
- **It is a site of its own.** It shares no file with Mainsail or Fluidd, so removing it cannot
  affect them. Keep it that way.
- **Only the commands that need root use `sudo`.** Editing `moonraker.conf` does not.
- **Realistic failures only.** The script handles nginx missing, a rejected configuration, a taken
  port and an unreadable home directory (it prints the `chmod o+x ~` hint). Do not add guards for
  failures that need two unlikely things to go wrong.
- The names `happy-hare-console` (site, log files, update manager section) are installed on users'
  machines. Renaming any of them strands existing installs.

## Testing without root

`test/test_install.py` runs the real script against a temporary directory:

- `NGINX_DIR` points at a fake `/etc/nginx`, `NGINX_BIN` at a stub that records its arguments and
  fails when `FAIL_NGINX` is set, `SUDO` is empty and `NO_RELOAD` skips the reload.
- `VIEWER_DIR` and `MOONRAKER_CONF` point at stand-ins, so a test never touches the real checkout's
  site or a real `moonraker.conf`.
- One test renders the site and runs a real `nginx -t` on it. It is skipped where no working nginx
  is installed and runs in CI.
- `TestViewerIsHostable` is the check that `viewer/` uses no root-absolute URLs.

The script is POSIX `sh`, not bash; CI runs `sh -n install.sh`.
