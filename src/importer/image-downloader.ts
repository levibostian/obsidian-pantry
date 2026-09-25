import { App, requestUrl } from "obsidian";
import { ensureParentFolders } from "./note-builder";

/**
 * Download a remote image into the vault and return its vault-relative path.
 *
 * Returns null when the request fails, the folder setting is empty, or the
 * response isn't an image — callers keep the original remote URL then.
 * Reuses an existing file at the target path instead of overwriting, so
 * re-importing a recipe (or sharing a hero image across recipes) never
 * duplicates or clobbers images.
 */
export async function downloadImportedImage(
	app: App,
	imageUrl: string,
	targetFolder: string,
): Promise<string | null> {
	const folder = targetFolder.trim().replace(/\/+$/, "");
	if (!folder) return null;

	const response = await requestUrl({ url: imageUrl, method: "GET" }).catch(
		() => null,
	);
	if (!response) return null;

	const contentType = (response.headers?.["content-type"] ?? "")
		.split(";")[0] ?? "";
	// Any image/* content type is accepted; the subtype becomes the extension.
	if (!contentType.startsWith("image/")) return null;
	const ext = contentType.slice("image/".length).replace(/[^a-z0-9]/g, "") || "png";

	const targetPath = `${folder}/${hashUrl(imageUrl)}.${ext}`;
	if (await app.vault.adapter.exists(targetPath)) return targetPath;

	await ensureParentFolders(app, targetPath);
	await app.vault.createBinary(targetPath, response.arrayBuffer);
	return targetPath;
}

/**
 * Stable short hash of the URL. Gives a predictable filename without URL
 * parsing, and two recipes sharing a hero image land on the same file.
 */
function hashUrl(url: string): string {
	let h = 5381;
	for (let i = 0; i < url.length; i++) {
		h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
	}
	return h.toString(16);
}