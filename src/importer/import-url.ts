import { App, Notice } from "obsidian";
import { PantrySettings } from "../settings";
import { fetchHtml } from "./fetcher";
import { downloadImportedImage } from "./image-downloader";
import { extractRecipe } from "./schema-extractor";
import { ImportedRecipe } from "./types";
import { saveImportedRecipe } from "./writer";

export interface ImportUrlOptions {
	/** Vault-relative folder override. Empty string uses the settings default. */
	folder?: string;
	/**
	 * What to do when a note with the imported title already exists.
	 * `prompt` shows the confirm dialog (interactive), `skip` leaves the
	 * existing note untouched so scripted batch imports never block on a
	 * modal. Defaults to `prompt`.
	 */
	onCollision?: "prompt" | "skip";
}

/**
 * Fetch a recipe page, extract structured data, download its image if the
 * setting is on, and save the note. Shared by the "Import recipe from URL"
 * modal and the `obsidian://pantry/import-url` protocol handler so both run
 * the identical import pipeline. Returns the recipe on success, null when
 * the URL could not be fetched or contained no structured recipe data (a
 * notice is shown in either case).
 */
export async function importRecipeFromUrl(
	app: App,
	url: string,
	settings: PantrySettings,
	options: ImportUrlOptions = {},
): Promise<ImportedRecipe | null> {
	new Notice("Fetching recipe…");

	const html = await fetchHtml(url);
	if (!html) {
		new Notice("Could not fetch that URL. Check the address and try again.");
		return null;
	}

	const recipe = extractRecipe(html, url);
	if (!recipe?.title) {
		new Notice(
			"No structured recipe data found on that page. The site may need a login or render its content with scripts. Try copying the recipe text and using the text importer instead.",
		);
		return null;
	}

	if (settings.downloadImportedImages) {
		const localPath = await downloadImportedImage(
			app,
			recipe.image,
			settings.downloadImportedImagePath,
			recipe.title,
		);
		if (localPath) {
			recipe.image = localPath;
		} else {
			new Notice("Could not download image. Using the remote URL instead.");
		}
	}

	await saveImportedRecipe(app, recipe, settings, options.folder ?? "", {
		onCollision: options.onCollision,
	});
	return recipe;
}