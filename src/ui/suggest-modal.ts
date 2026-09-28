import { App, Modal, Notice, Setting, TFile, setIcon } from "obsidian";
import { resolveRecipeImage } from "../utils/recipe-image";
import { GroceryListManager } from "../grocery/manager";
import {
	listRecipeLibrary,
	RecipeEntry,
	suggestMeals,
	SuggestionFilters,
} from "../grocery/library";
import { setRecipeSelection } from "../grocery/selection";
import { daysSince, formatMinutes } from "../parser/recipe-meta";
import { PantrySettings } from "../settings";

interface SuggestModalDeps {
	getSettings: () => PantrySettings;
	saveSettings: () => Promise<void>;
	manager: GroceryListManager;
}

/**
 * Picks a handful of recipes the user hasn't cooked recently and offers
 * to add them to the grocery list with one click. Re-rolling reuses the
 * same filters but reshuffles the candidate set.
 */
export class SuggestMealModal extends Modal {
	private filters: SuggestionFilters;

	constructor(
		app: App,
		private readonly deps: SuggestModalDeps,
	) {
		super(app);
		this.filters = {
			favoritesOnly: false,
			hideAllergens:
				deps.getSettings().myAllergens.length > 0,
		};
	}

	onOpen(): void {
		this.modalEl.addClass("pantry-suggest-modal");
		this.titleEl.setText("Suggest a meal");
		this.render(false);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/**
	 * Renders suggestions. On first open, the last suggested set is
	 * restored (so closing the modal to read a recipe and reopening shows
	 * the same options); rerolling or changing a filter draws a fresh set.
	 * The drawn set is persisted so reopening keeps what the user saw.
	 */
	private render(regenerate: boolean): void {
		const { contentEl } = this;
		contentEl.empty();

		const settings = this.deps.getSettings();
		const library = listRecipeLibrary(this.app, settings);

		this.renderFilters(contentEl, settings);

		const suggestions = regenerate ? null : this.restoreSuggestions(library);
		const drawn =
			suggestions ??
			suggestMeals(
				library,
				settings,
				this.filters,
				settings.suggestionCount,
			);
		if (suggestions === null) {
			this.storeSuggestions(drawn.map((entry) => entry.file.path));
		}

		const list = contentEl.createDiv({ cls: "pantry-suggest-list" });

		if (drawn.length === 0) {
			list.createDiv({
				cls: "pantry-suggest-empty",
				text: this.emptyMessage(library, settings),
			});
		} else {
			for (const entry of drawn) {
				this.renderSuggestion(list, entry);
			}
		}

		const footer = contentEl.createDiv({ cls: "pantry-suggest-footer" });
		const reroll = footer.createEl("button", {
			cls: "mod-cta",
			text: "Suggest other meals",
			attr: { type: "button" },
		});
		reroll.addEventListener("click", () => {
			this.render(true);
		});
	}

	/**
	 * Persist the current suggestion set in plugin settings so reopening
	 * the modal shows the same options. Only the paths are stored; card
	 * metadata is re-read from the files at render time.
	 */
	private storeSuggestions(paths: string[]): void {
		const settings = this.deps.getSettings();
		settings.storedSuggestions = {
			paths,
			favoritesOnly: this.filters.favoritesOnly,
			hideAllergens: this.filters.hideAllergens,
		};
		void this.deps.saveSettings();
	}

	/**
	 * Look up the last suggested set in the current library, dropping
	 * recipes that no longer exist. Returns null when there is nothing
	 * usable or the active filters changed since it was drawn.
	 */
	private restoreSuggestions(
		library: readonly RecipeEntry[],
	): RecipeEntry[] | null {
		const stored = this.deps.getSettings().storedSuggestions;
		if (!stored) return null;
		if (
			stored.favoritesOnly !== this.filters.favoritesOnly ||
			stored.hideAllergens !== this.filters.hideAllergens
		) {
			return null;
		}
		const byPath = new Map(
			library.map((entry) => [entry.file.path, entry] as const),
		);
		const restored = stored.paths
			.map((path) => byPath.get(path))
			.filter((entry): entry is RecipeEntry => entry !== undefined);
		return restored.length > 0 ? restored : null;
	}

	private renderFilters(
		container: HTMLElement,
		settings: PantrySettings,
	): void {
		const filters = container.createDiv({
			cls: "pantry-suggest-filters",
		});

		new Setting(filters)
			.setName("Favorites only")
			.addToggle((toggle) =>
				toggle.setValue(this.filters.favoritesOnly).onChange((value) => {
					this.filters.favoritesOnly = value;
					this.render(true);
				}),
			);

		if (settings.myAllergens.length > 0) {
			new Setting(filters)
				.setName("Hide recipes with my allergens")
				.addToggle((toggle) =>
					toggle.setValue(this.filters.hideAllergens).onChange((value) => {
						this.filters.hideAllergens = value;
						this.render(true);
					}),
				);
		}
	}

	private renderSuggestion(parent: HTMLElement, entry: RecipeEntry): void {
		const { file, meta } = entry;
		const card = parent.createDiv({ cls: "pantry-suggest-card" });

		this.renderCardImage(card, file, meta.image);

		const title = card.createDiv({ cls: "pantry-suggest-card-title" });
		const link = title.createEl("a", {
			cls: "pantry-suggest-card-link",
			text: file.basename,
			href: "#",
		});
		link.addEventListener("click", (evt) => {
			evt.preventDefault();
			this.close();
			void this.app.workspace.getLeaf(false).openFile(file);
		});
		if (meta.favorite) {
			const star = title.createSpan({
				cls: "pantry-suggest-card-fav",
			});
			setIcon(star, "star");
			star.setAttribute("title", "Favorite");
		}

		const meta_row = card.createDiv({ cls: "pantry-suggest-card-meta" });
		const days = daysSince(meta.lastMade);
		const lastMadeText =
			days === null
				? "Never made"
				: days === 0
					? "Made today"
					: days === 1
						? "Made yesterday"
						: `${days} days ago`;
		meta_row.createSpan({
			cls: "pantry-suggest-card-meta-item",
			text: lastMadeText,
		});
		if (meta.cookedCount > 0) {
			meta_row.createSpan({
				cls: "pantry-suggest-card-meta-item",
				text: `Cooked ${meta.cookedCount}×`,
			});
		}
		if (meta.times.total !== null) {
			meta_row.createSpan({
				cls: "pantry-suggest-card-meta-item",
				text: formatMinutes(meta.times.total),
			});
		}

		if (meta.diet.length > 0) {
			const tags = card.createDiv({ cls: "pantry-suggest-card-tags" });
			for (const tag of meta.diet) {
				tags.createSpan({
					cls: "pantry-badge pantry-badge-diet",
					text: tag,
				});
			}
		}

		const actions = card.createDiv({ cls: "pantry-suggest-card-actions" });
		const addBtn = actions.createEl("button", {
			cls: "mod-cta",
			text: "Add to list",
			attr: { type: "button" },
		});
		addBtn.addEventListener("click", () => {
			void this.addToList(file).then(() => {
				addBtn.disabled = true;
				addBtn.setText("Added");
			});
		});
	}

	private renderCardImage(
		card: HTMLElement,
		file: TFile,
		raw: string | null,
	): void {
		const url = raw ? resolveRecipeImage(this.app, raw, file) : null;
		if (!url) return;
		const imageCard = card.createDiv({ cls: "pantry-recipe-image-card" });
		const img = imageCard.createEl("img", {
			cls: "pantry-recipe-image",
			attr: { alt: file.basename, src: url },
		});
		img.addEventListener("error", () => imageCard.remove());
	}

	private async addToList(file: TFile): Promise<void> {
		await setRecipeSelection(this.app, file, true, this.deps.getSettings());
		await this.deps.manager.refresh();
		new Notice(`Added "${file.basename}" to grocery list.`);
	}

	private emptyMessage(
		library: readonly RecipeEntry[],
		settings: PantrySettings,
	): string {
		if (library.length === 0) {
			return `No recipes found. Tag a note with type: ${settings.recipeTypeValue} to populate the library.`;
		}
		const filterBits: string[] = [];
		if (this.filters.favoritesOnly) filterBits.push("favorites only");
		if (this.filters.hideAllergens) filterBits.push("hiding allergens");
		const filtersText = filterBits.length
			? ` (${filterBits.join(", ")})`
			: "";
		return `No fresh suggestions${filtersText}. Try widening the suggestion day window or relaxing the filters.`;
	}
}
