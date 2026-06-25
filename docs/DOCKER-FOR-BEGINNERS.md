# Docker for First-Timers — Running RAIS Step by Step

You've never used Docker. That's fine. This guide assumes **zero** prior
knowledge and walks you through everything, in order, with copy-paste commands.
Read the concepts once (5 minutes), then follow the steps.

---

## Part 0 — The idea, in plain words

Imagine you cook a dish and want your friend to have the *exact* same meal, with
no chance of "it tastes different on my stove." Instead of mailing the recipe,
you mail the **finished, sealed lunchbox**. They just open it and eat.

Docker is that lunchbox for software.

- **Image** = the sealed lunchbox (your app, frozen, with everything it needs).
- **Container** = the lunchbox opened and running (a live copy of the image).
- **Volume** = a lunchbox that *remembers* (where the database saves data so it
  survives restarts).
- **Docker Compose** = a recipe card (`docker-compose.yml`) that says "open these
  4 lunchboxes together and let them talk to each other." For us the 4 are:
  the web app, the database (Postgres), the AI (Ollama), and the doorman (Caddy).

You will do two things:
1. **Build** the app lunchbox **on your Windows PC** (where the code is).
2. **Run** all the lunchboxes **on the plant's server** (a Linux machine).

> You can also do both on the same machine while testing. The commands are the same.

---

## Part 1 — Install Docker

### On your Windows PC (for building/testing)
1. Download **Docker Desktop** from https://www.docker.com/products/docker-desktop
2. Run the installer, click through, **restart** when it asks.
3. Open **Docker Desktop** from the Start menu and wait until the whale icon in
   the taskbar stops animating (it's "ready").
4. Open **PowerShell** and check it works:
   ```powershell
   docker --version
   docker compose version
   ```
   If both print a version number, you're good.

### On the plant's server (for running it for real)
The server is Linux (e.g. Ubuntu). On that machine, in its terminal:
```bash
curl -fsSL https://get.docker.com | sh        # installs Docker Engine
sudo usermod -aG docker $USER                  # let your user run docker
# log out and back in once, then:
docker --version
```

---

## Part 2 — Build the app lunchbox (on your Windows PC)

Open PowerShell **in the project folder** (where `docker-compose.yml` lives):

```powershell
cd C:\Users\acer\Documents\projects\RAIS-Pro
```

Build the app image. (First time is slow — 5–15 min — because it downloads the
ingredients. Later builds are fast.)

```powershell
docker compose build app
```

When it finishes you have an image called `rais-app`. Check it:
```powershell
docker images
```
You should see `rais-app` in the list.

---

## Part 3 — Set up the configuration file

The app needs a few settings (database password, etc.). There's a template;
copy it to a real file called `.env` and edit it.

```powershell
copy .env.template .env
notepad .env
```

In Notepad, change **at least** these two lines to the *same* strong password
(make up a long random string, no spaces):

```
POSTGRES_PASSWORD=put-a-long-random-password-here
DATABASE_URL=postgres://rais:put-a-long-random-password-here@db:5432/rais
```

Leave the rest as-is (it already says use local Ollama, no internet). Save and
close Notepad.

> ⚠️ Never share or commit the `.env` file — it has your password.

---

## Part 4 — Turn it all on

This one command starts all four lunchboxes:

```powershell
docker compose up -d
```

- `up` = start everything in the recipe.
- `-d` = "detached" = run in the background so you get your prompt back.

Check they're all alive:
```powershell
docker compose ps
```
You want to see `app`, `db`, `ollama`, `caddy` all `running` (the app may say
`health: starting` for ~30 seconds, then `healthy`).

Watch the app boot (press `Ctrl+C` to stop watching — this does NOT stop the app):
```powershell
docker compose logs -f app
```
Look for a line like `Ready` or `started server`.

---

## Part 5 — Give the AI its brain (one time)

The AI box (Ollama) starts empty. Download the model once:

```powershell
docker compose exec ollama ollama pull qwen2.5:3b
```

(`exec` = "run a command inside a running lunchbox." Here: tell Ollama to pull
the model. It downloads ~2 GB; needs internet **this once**, or pre-load it
offline per `docs/DEPLOYMENT.md` §4.)

---

## Part 6 — Use it

Open a browser and go to:
```
https://localhost/
```
(or, on the plant server, `https://<that-server's-IP>/`)

The browser will warn "Not secure / certificate not trusted." That's expected —
your appliance made its **own** security certificate because it has no internet.
Click **Advanced → Proceed** to continue. (To remove the warning permanently,
trust Caddy's root certificate once — see `docs/DEPLOYMENT.md` §2.)

You should see the RAIS dashboard. 🎉

---

## Part 7 — Everyday commands (cheat sheet)

```powershell
docker compose ps                 # what's running?
docker compose logs -f app        # watch the app's logs (Ctrl+C to exit)
docker compose stop               # pause everything (data is kept)
docker compose start              # resume
docker compose down               # stop AND remove the containers (data in volumes is STILL kept)
docker compose up -d              # start again
```

> `down` sounds scary but your **data is safe** — it lives in "volumes," which
> `down` does not delete. (Only `docker compose down -v` deletes data. Don't run
> that unless you truly want a clean wipe.)

---

## Part 8 — Updating to a new version

When you (the developer) ship a new app version:

**On your PC** — rebuild and save it to a file:
```powershell
docker compose build app
docker save rais-app:latest -o rais-app-new.tar
```
Copy `rais-app-new.tar` to the plant server (USB stick / file share).

**On the plant server** — load it and restart just the app:
```bash
docker load -i rais-app-new.tar
docker compose up -d app
```
The database keeps all its data. Done.

---

## Part 9 — Shipping to a plant with NO internet

Build everything on your PC, bundle it into one file, carry it over:

**Your PC:**
```powershell
docker compose build app
docker pull postgres:16-alpine
docker pull caddy:2-alpine
docker pull ollama/ollama:latest
docker save rais-app:latest postgres:16-alpine caddy:2-alpine ollama/ollama:latest -o rais-appliance.tar
```
Copy to the server: `rais-appliance.tar`, `docker-compose.yml`, `Caddyfile`,
`.env.template`, and the `db/` folder.

**Plant server:**
```bash
docker load -i rais-appliance.tar
cp .env.template .env && nano .env      # set the password (same in both lines)
docker compose up -d
docker compose exec ollama ollama pull qwen2.5:3b   # or pre-loaded offline
```

---

## Part 10 — When something goes wrong

| Symptom | Try this |
|--------|----------|
| `docker: command not found` | Docker isn't installed / Desktop isn't running. Part 1. |
| A service says `unhealthy` or keeps restarting | `docker compose logs <name>` (e.g. `docker compose logs app`) to read the error. |
| App can't reach the database | Check `POSTGRES_PASSWORD` and `DATABASE_URL` in `.env` use the **same** password. Then `docker compose up -d`. |
| Browser cert warning | Expected (self-made cert). Click Advanced → Proceed, or trust the root CA (DEPLOYMENT.md §2). |
| AI features error | Did you run the model pull (Part 5)? Check `docker compose logs ollama`. |
| "port is already allocated" | Something else uses port 80/443. Stop it, or change the ports in `docker-compose.yml`. |
| Want a totally fresh start | `docker compose down -v` **(deletes all data!)**, then `docker compose up -d`. |

---

## One-paragraph summary

Install Docker → `docker compose build app` (make the lunchbox) → copy
`.env.template` to `.env` and set a password → `docker compose up -d` (open all
lunchboxes) → `docker compose exec ollama ollama pull qwen2.5:3b` (give the AI its
model) → open `https://localhost/`. To update: rebuild, `docker save`, copy over,
`docker load`, `docker compose up -d app`. Your data lives in volumes and
survives restarts and updates.
