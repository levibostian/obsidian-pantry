import { App, Modal, Notice, Setting } from "obsidian";
import { importRecipeFromUrl } from "../importer/import-url";
import { defaultImportFolder } from "../importer/note-builder";
import { PantrySettings } from "../settings";

export interface ImportRecipeHost {
	getSettings(): PantrySettings;
}

export class ImportRecipeModal extends Modal {
	private url = "";
	private folder = "";

	constructor(
		app: App,
		private readonly host: ImportRecipeHost,
	) {
		super(app);
		this.folder = defaultImportFolder(host.getSettings());
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("pantry-import-modal");
		this.titleEl.setText("Import recipe from URL");

		new Setting(contentEl)
			.setName("Recipe URL")
			.setDesc("Paste the address of a recipe page with structured data.")
			.addText((text) =>
				text
					.setPlaceholder("Paste recipe page address")
					.onChange((value) => {
						this.url = value.trim();
					}),
			);

		new Setting(contentEl)
			.setName("Save to folder")
			.setDesc("Vault-relative folder for the new note.")
			.addText((text) =>
				text
					.setPlaceholder("Recipes")
					.setValue(this.folder)
					.onChange((value) => {
						this.folder = value.trim();
					}),
			);

		const actions = contentEl.createDiv({ cls: "pantry-modal-actions" });
		actions
			.createEl("button", { text: "Cancel", attr: { type: "button" } })
			.addEventListener("click", () => this.close());

		const importBtn = actions.createEl("button", {
			text: "Import",
			cls: "mod-cta",
			attr: { type: "button" },
		});
		importBtn.addEventListener("click", () => {
			importBtn.disabled = true;
			void (async () => {
				try {
					await this.submit();
				} finally {
					importBtn.disabled = false;
				}
			})();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		if (!this.url) {
			new Notice("Please enter a URL.");
			return;
		}

		await importRecipeFromUrl(this.app, this.url, this.host.getSettings(), {
			folder: this.folder,
		});
		this.close();
	}
}
