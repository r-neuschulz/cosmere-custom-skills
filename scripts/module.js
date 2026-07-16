/**
 * Cosmere RPG - Custom Skills
 *
 * Lets the GM define custom roll-skills (e.g. the Spiritual skill "Desperation")
 * from the module settings. Each custom skill is registered with the Cosmere RPG
 * system as a normal, always-visible skill tied to an attribute of the GM's
 * choice, so it shows up on every character sheet with an editable rank and a
 * roll button.
 *
 * Timing note: the system builds each Actor's skill schema dynamically from
 * `CONFIG.COSMERE.skills` inside `getSkillsSchema()`. Foundry constructs world
 * documents (and therefore those schemas) during `initializeDocuments()`, which
 * runs AFTER every `init` hook but BEFORE `setup`. The system's own `init` hook
 * (which populates `CONFIG.COSMERE`) runs before ours because system esmodules
 * are injected before non-library module esmodules. So registering our skills in
 * the `init` hook is both safe (config exists) and necessary (before the schema
 * is frozen). Adding/removing skills therefore requires a world reload.
 */

const MODULE_ID = 'cosmere-custom-skills';
const SETTING = 'customSkills';

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Read the stored custom-skill definitions.
 * @returns {Array<{id: string, label: string, attribute: string}>}
 */
function getCustomSkills() {
    const value = game.settings.get(MODULE_ID, SETTING);
    return Array.isArray(value) ? value : [];
}

/**
 * Turn a free-text label into a safe, config-friendly skill id.
 * @param {string} label
 * @returns {string}
 */
function slugifyId(label) {
    return String(label ?? '')
        .trim()
        .replace(/[^A-Za-z0-9]+/g, '')
        .replace(/^(\d)/, '_$1'); // ids should not start with a digit
}

/**
 * Build attribute choices grouped by attribute group, sourced from the live
 * system config so labels stay localized and in sync with the system.
 * @returns {Array<{key: string, label: string, attributes: Array<{key: string, label: string}>}>}
 */
function getAttributeGroups() {
    const groups = [];
    for (const group of Object.values(CONFIG.COSMERE.attributeGroups)) {
        groups.push({
            key: group.key,
            label: game.i18n.localize(group.label),
            attributes: group.attributes.map((attrId) => ({
                key: attrId,
                label: game.i18n.localize(CONFIG.COSMERE.attributes[attrId].label),
            })),
        });
    }
    return groups;
}

/**
 * Register every stored custom skill with the Cosmere RPG system.
 * Must run during `init`, after the system config is available.
 */
function registerCustomSkills() {
    const api = game.system?.api;
    if (!api?.registerSkill) {
        console.error(`${MODULE_ID} | Cosmere RPG skill API not found; is the cosmere-rpg system active?`);
        return;
    }

    for (const skill of getCustomSkills()) {
        if (!skill?.id || !skill?.attribute) continue;

        // Never clobber an existing (e.g. core) skill.
        if (CONFIG.COSMERE.skills[skill.id]) {
            console.warn(`${MODULE_ID} | Skipping "${skill.id}" - a skill with that id already exists.`);
            continue;
        }
        // Only register against attributes the system actually knows about.
        if (!CONFIG.COSMERE.attributes[skill.attribute]) {
            console.warn(`${MODULE_ID} | Skipping "${skill.id}" - unknown attribute "${skill.attribute}".`);
            continue;
        }

        try {
            api.registerSkill({
                id: skill.id,
                label: skill.label || skill.id,
                attribute: skill.attribute,
                core: true, // always visible + rankable, like the standard skills
                hiddenUntilAcquired: false,
                source: MODULE_ID,
            });
            console.log(`${MODULE_ID} | Registered custom skill "${skill.id}" (${skill.attribute}).`);
        } catch (err) {
            console.error(`${MODULE_ID} | Failed to register skill "${skill.id}":`, err);
        }
    }
}

/* -------------------------------------------- */
/*  Settings management application             */
/* -------------------------------------------- */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class CustomSkillsMenu extends HandlebarsApplicationMixin(ApplicationV2) {
    /** Working copy of the skill list, edited in-memory until saved. */
    #skills = getCustomSkills().map((s) => ({ ...s }));

    static DEFAULT_OPTIONS = {
        id: 'cosmere-custom-skills-menu',
        tag: 'form',
        classes: ['cosmere-custom-skills', 'standard-form'],
        window: {
            title: 'COSMERE-CUSTOM-SKILLS.Menu.Title',
            icon: 'fa-solid fa-hand-sparkles',
            contentClasses: ['standard-form'],
        },
        position: { width: 680, height: 'auto' },
        form: {
            handler: CustomSkillsMenu.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
        actions: {
            addSkill: CustomSkillsMenu.#onAddSkill,
            deleteSkill: CustomSkillsMenu.#onDeleteSkill,
        },
    };

    static PARTS = {
        form: { template: `modules/${MODULE_ID}/templates/skills-menu.hbs` },
    };

    /** @override */
    async _prepareContext() {
        const groups = getAttributeGroups();
        const skills = this.#skills.map((skill, index) => ({
            index,
            id: skill.id ?? '',
            label: skill.label ?? '',
            // Precompute grouped <option> data with selection resolved here so the
            // template needs no comparison helpers.
            optionGroups: groups.map((group) => ({
                label: group.label,
                options: group.attributes.map((attr) => ({
                    key: attr.key,
                    label: attr.label,
                    selected: attr.key === skill.attribute,
                })),
            })),
        }));
        return {
            skills,
            hasSkills: skills.length > 0,
        };
    }

    /**
     * Read the current DOM inputs back into the working copy so unsaved edits
     * survive an add/delete re-render.
     */
    #captureState() {
        const form = this.element;
        if (!form) return;
        const data = new foundry.applications.ux.FormDataExtended(form).object;
        const expanded = foundry.utils.expandObject(data);
        const rows = expanded.skills ?? {};
        this.#skills = Object.keys(rows)
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => ({
                id: (rows[k].id ?? '').trim(),
                label: (rows[k].label ?? '').trim(),
                attribute: rows[k].attribute ?? '',
            }));
    }

    static #onAddSkill() {
        this.#captureState();
        this.#skills.push({ id: '', label: '', attribute: '' });
        this.render();
    }

    static #onDeleteSkill(event, target) {
        this.#captureState();
        const index = Number(target.dataset.index);
        if (!Number.isNaN(index)) this.#skills.splice(index, 1);
        this.render();
    }

    /**
     * Validate + persist, then offer a world reload (skills only take effect at init).
     * @this {CustomSkillsMenu}
     */
    static async #onSubmit(event, form, formData) {
        const expanded = foundry.utils.expandObject(formData.object);
        const rows = expanded.skills ?? {};

        // Skills we already own (from the saved setting). Anything already in
        // `CONFIG.COSMERE.skills` that is NOT one of these is a built-in (or another
        // module's) skill and must not be overwritten. We cannot rely on a `source`
        // field here: the system's registerSkill does not persist one.
        const ownIds = new Set(getCustomSkills().map((s) => s.id));

        const cleaned = [];
        const seen = new Set();
        for (const key of Object.keys(rows).sort((a, b) => Number(a) - Number(b))) {
            const row = rows[key];
            const label = (row.label ?? '').trim();
            const attribute = row.attribute ?? '';
            let id = (row.id ?? '').trim();
            if (!id) id = slugifyId(label);

            // Drop entirely-empty rows silently.
            if (!id && !label && !attribute) continue;

            // Validation errors are THROWN, not returned: Foundry's form handler only
            // keeps the window open (and preserves the user's edits) when the handler
            // rejects. The thrown message is surfaced via ui.notifications by core.
            if (!label) {
                throw new Error(game.i18n.localize('COSMERE-CUSTOM-SKILLS.Errors.MissingLabel'));
            }
            if (!id) {
                throw new Error(game.i18n.localize('COSMERE-CUSTOM-SKILLS.Errors.MissingId'));
            }
            // The id becomes a config key AND a DataModel schema field name, so it must
            // be a plain identifier (dots would be read as nested paths by Foundry).
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) {
                throw new Error(game.i18n.format('COSMERE-CUSTOM-SKILLS.Errors.InvalidId', { id }));
            }
            if (!attribute || !CONFIG.COSMERE.attributes[attribute]) {
                throw new Error(game.i18n.format('COSMERE-CUSTOM-SKILLS.Errors.MissingAttribute', { label }));
            }
            if (CONFIG.COSMERE.skills[id] && !ownIds.has(id)) {
                throw new Error(game.i18n.format('COSMERE-CUSTOM-SKILLS.Errors.ReservedId', { id }));
            }
            if (seen.has(id)) {
                throw new Error(game.i18n.format('COSMERE-CUSTOM-SKILLS.Errors.DuplicateId', { id }));
            }
            seen.add(id);
            cleaned.push({ id, label, attribute });
        }

        // No-op if nothing actually changed, so we don't nag for a world reload.
        const current = getCustomSkills().map((s) => ({
            id: s.id,
            label: s.label,
            attribute: s.attribute,
        }));
        if (JSON.stringify(current) === JSON.stringify(cleaned)) return;

        await game.settings.set(MODULE_ID, SETTING, cleaned);

        // The skill schema is built at init, so changes need a reload to apply.
        await foundry.applications.settings.SettingsConfig.reloadConfirm({ world: true });
    }
}

/* -------------------------------------------- */
/*  Hooks                                        */
/* -------------------------------------------- */

Hooks.once('init', () => {
    game.settings.register(MODULE_ID, SETTING, {
        scope: 'world',
        config: false,
        type: Array,
        default: [],
    });

    game.settings.registerMenu(MODULE_ID, 'manager', {
        name: 'COSMERE-CUSTOM-SKILLS.Menu.Name',
        label: 'COSMERE-CUSTOM-SKILLS.Menu.Label',
        hint: 'COSMERE-CUSTOM-SKILLS.Menu.Hint',
        icon: 'fa-solid fa-hand-sparkles',
        type: CustomSkillsMenu,
        restricted: true, // GM only
    });

    // Register stored skills now, before the system freezes the actor schema.
    registerCustomSkills();
});
