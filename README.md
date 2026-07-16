# Cosmere RPG - Custom Skills

A [Foundry VTT](https://foundryvtt.com/) module for the community
[Cosmere Roleplaying Game](https://foundryvtt.com/packages/cosmere-rpg) system that lets a
GM define **custom roll-skills** — such as the Spiritual skill *Desperation* — and have
them appear on every character sheet, complete with an editable rank track and a roll
button, exactly like the built-in skills.

Skills are managed globally from **Game Settings**, so there is nothing to configure per
actor.

## Features

- Add any number of custom skills from a single settings screen.
- Each skill is tied to an attribute, grouped by **Physical / Cognitive / Spiritual**
  (e.g. *Desperation* → Awareness or Presence).
- Custom skills behave like core skills: always visible, rankable, and rollable.
- Validates identifiers (unique, no clashes with built-in skills).

## Usage

1. Enable **Cosmere RPG - Custom Skills** in **Manage Modules**.
2. Open **Game Settings → Configure Settings → Manage Custom Skills**.
3. Click **Add Skill**, enter a name (e.g. `Desperation`), pick an attribute, and **Save**.
4. Reload the world when prompted — the skill then appears on every character sheet.

> Adding or removing a skill changes the actor data schema, which the Cosmere system
> builds during initialization, so a world reload is required for changes to take effect.

## Installation

**Manifest URL:**

```
https://github.com/r-neuschulz/cosmere-custom-skills/releases/latest/download/module.json
```

In Foundry: *Add-on Modules → Install Module* and paste the manifest URL.

## Releasing (maintainers)

Releases are automated by [`.github/workflows/release.yml`](.github/workflows/release.yml).
Bump `version` in `module.json`, commit, and push to `main`. CI tags `v<version>`,
builds `module.zip`, injects the release URLs, and publishes the GitHub release with
`module.json` + `module.zip` attached. Re-pushing an already-released version is a no-op.

## Compatibility

- Foundry VTT v13+
- Cosmere RPG system v2.1.0+

## License

[MIT](LICENSE)
