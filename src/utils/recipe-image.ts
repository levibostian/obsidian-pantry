import { App, TFile } from "obsidian";

/**
 * Resolve a frontmatter `image` value to a loadable URL. Accepts remote
 * URLs (http/data/app/capacitor), wikilinks, vault-relative paths, and
 * bare filenames. Returns null when nothing usable is found.
 */
export function resolveRecipeImage(
	app: App,
	value: string,
	sourceFile: TFile,
): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;

	if (/^(https?:|data:|app:|capacitor:)/i.test(trimmed)) {
		return trimmed;
	}

	const wikilink = trimmed.match(/^!?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/);
	const target = ((wikilink ? wikilink[1] : trimmed) ?? trimmed).trim();

	const linked = app.metadataCache.getFirstLinkpathDest(
		target,
		sourceFile.path,
	);
	if (linked) {
		return app.vault.getResourcePath(linked);
	}
	const direct = app.vault.getAbstractFileByPath(target);
	if (direct instanceof TFile) {
		return app.vault.getResourcePath(direct);
	}
	return null;
}