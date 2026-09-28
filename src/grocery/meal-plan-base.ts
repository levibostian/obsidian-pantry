import { App, Notice } from "obsidian";
import { PantrySettings } from "../settings";

/** Vault-relative path of the generated Obsidian Bases file. */
export const MEAL_PLAN_BASE_PATH = "MealPlan.base";

function quote(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Renders the YAML for an Obsidian Bases cards view that lists the recipes
 * currently in the grocery list (the selection property set). Mirrors the
 * constructs already used by hand-written .base files so the result opens
 * as a gallery without any extra setup.
 */
export function renderMealPlanBaseYaml(settings: PantrySettings): string {
	const folderFilters = settings.recipeFolders
		.map((folder) => folder.trim().replace(/\/+$/, ""))
		.filter((folder) => folder.length > 0)
		.map((folder) => `        - file.inFolder(${quote(folder)})`);

	const lines = [
		"properties:",
		"  file.name:",
		"    displayName: Meal",
		"  note.image:",
		"    displayName: Image",
		"views:",
		"  - type: cards",
		"    name: Meal plan",
		"    filters:",
		"      and:",
		'        - file.ext == "md"',
		...folderFilters,
		`        - note.${settings.selectionProperty} == true`,
		"    order:",
		"      - file.name",
		"    image: note.image",
		"    imageAspectRatio: 1",
		"    cardSize: 230",
	];
	return lines.join("\n") + "\n";
}

/**
 * Write the MealPlan base at the vault root. Refuses to overwrite an
 * existing file so hand tweaks aren't clobbered on re-runs.
 */
export async function createMealPlanBase(
	app: App,
	settings: PantrySettings,
): Promise<void> {
	if (app.vault.getAbstractFileByPath(MEAL_PLAN_BASE_PATH)) {
		new Notice(`"${MEAL_PLAN_BASE_PATH}" already exists.`);
		return;
	}
	await app.vault.create(
		MEAL_PLAN_BASE_PATH,
		renderMealPlanBaseYaml(settings),
	);
	new Notice(`Created "${MEAL_PLAN_BASE_PATH}".`);
}