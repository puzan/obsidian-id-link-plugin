import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	ToggleComponent,
	TFile,
	moment,
} from "obsidian";
import { getAPI, DataviewApi, isPluginEnabled } from "obsidian-dataview";

enum IdSource {
	Property = "0-property",
	FileName = "1-fileName",
}

interface IdLinkSettings {
	idSources: IdSource[];

	idProperty: string;
	idFilenameRegex: string;
	idFormat: string;
	autoGenerateId: boolean;
}

const DEFAULT_SETTINGS: IdLinkSettings = {
	idSources: [IdSource.Property, IdSource.FileName],
	idProperty: "id",
	idFilenameRegex: "^(\\d{14}) ",
	idFormat: "YYYYMMDDHHmmss",
	autoGenerateId: true,
};

export default class IdLinkPlugin extends Plugin {
	settings: IdLinkSettings;
	checks: ((p: Record<string, any>, id: string) => boolean)[];

	async onload() {
		await this.loadSettings();

		this.loadChecks();

		this.addSettingTab(new IdLinkSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile)) {
					return;
				}

				menu.addItem((item) => {
					item.setTitle("Copy ID Link")
						.setIcon("link")
						.onClick(() => this.findIdAndGenerateLink(file));
				});
			}),
		);

		this.addCommand({
			id: "copy-id-link",
			name: "Copy ID Link",
			callback: () => {
				const activeFile = this.app.workspace.getActiveFile();

				if (!activeFile) {
					new Notice("No active file");
					return;
				}

				this.findIdAndGenerateLink(activeFile);
			},
		});

		this.addCommand({
			id: "generate-new-id",
			name: "Generate New ID",
			callback: () => {
				const id = this.generateNewId();
				navigator.clipboard.writeText(id);
				new Notice(`Generated ID copied to clipboard: ${id}`);
			},
		});

		this.registerObsidianProtocolHandler("id-link", (params) => {
			const dvApi = this.getDataViewApi();

			const id = params["id"];
			if (!id) {
				this.showErrorAndThrow("Id is missed in link");
			}

			const path = dvApi
				.pages()
				.where((p: Record<string, any>) =>
					this.checks.some((check) => check(p, id)),
				)
				.first()?.file.path;

			if (!path) {
				this.showErrorAndThrow(`Page with id ${id} is not found`);
			}

			this.app.workspace.openLinkText(path, "", false, { active: true });
		});
	}

	onunload() {}

	getDataViewApi(): DataviewApi {
		const errorMessage =
			"Dataview is missed. Please install and enable Dataview plugin to use Id Link plugin";

		if (!isPluginEnabled(this.app)) {
			this.showErrorAndThrow(errorMessage);
		}

		const dvApi = getAPI(this.app);

		if (!dvApi) {
			this.showErrorAndThrow(errorMessage);
		}

		return dvApi;
	}

	private showErrorAndThrow(errorMessage: string): never {
		const message = `Id Link: ${errorMessage}`;

		new Notice(message);
		throw Error(message);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	loadChecks() {
		this.checks = this.settings.idSources.map((source) => {
			switch (source) {
				case IdSource.Property:
					return (p: Record<string, any>, id: string) =>
						p[this.settings.idProperty] == id;
				case IdSource.FileName: {
					const regex = new RegExp(this.settings.idFilenameRegex);
					return (p: Record<string, any>, id: string) =>
						regex.exec(p.file.name)?.[1] == id;
				}
			}
		});
	}

	generateIdLink(id: string): string {
		const vaultName = this.app.vault.getName();
		return `obsidian://id-link?vault=${encodeURIComponent(vaultName)}&id=${encodeURIComponent(id)}`;
	}

	private generateNewId(): string {
		return moment().format(this.settings.idFormat);
	}

	private async saveIdToProperty(file: TFile, id: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter[this.settings.idProperty] = id;
		});
	}

	private async findIdAndGenerateLink(file: TFile): Promise<void> {
		let id: string | undefined;

		// Try to find ID from property
		if (this.settings.idSources.includes(IdSource.Property)) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache?.frontmatter) {
				id = cache.frontmatter[this.settings.idProperty];
			}
		}

		// Try to find ID from filename if not found in property
		if (!id && this.settings.idSources.includes(IdSource.FileName)) {
			const regex = new RegExp(this.settings.idFilenameRegex);
			const match = regex.exec(file.name);
			if (match) {
				id = match[1];
			}
		}

		// Generate new ID if not found and auto generation is enabled
		if (
			!id &&
			this.settings.autoGenerateId &&
			this.settings.idSources.includes(IdSource.Property)
		) {
			id = this.generateNewId();
			await this.saveIdToProperty(file, id);
		}

		if (!id) {
			new Notice("No ID found in the file");
			return;
		}

		const link = this.generateIdLink(id);
		navigator.clipboard.writeText(link);
		new Notice("ID link copied to clipboard");
	}
}

class IdLinkSettingTab extends PluginSettingTab {
	plugin: IdLinkPlugin;

	constructor(app: App, plugin: IdLinkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Property ID settings group
		containerEl.createEl("h3", { text: "Property ID Settings" });
		new Setting(containerEl)
			.setName("Id sources: Property")
			.setDesc("Enable id search by property")
			.addToggle((toggle) =>
				this.toggleForIdSource(IdSource.Property, toggle),
			);

		if (this.plugin.settings.idSources.includes(IdSource.Property)) {
			new Setting(containerEl)
				.setName("Id property")
				.setDesc("Choose which property will be used for id")
				.addText((text) =>
					text
						.setPlaceholder("id")
						.setValue(this.plugin.settings.idProperty)
						.onChange(async (value) => {
							this.plugin.settings.idProperty = value;
							await this.plugin.saveSettings();
						}),
				);

			new Setting(containerEl)
				.setName("Auto generate ID")
				.setDesc(
					"Automatically generate and save ID if not found (only when Property ID source is enabled)",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.autoGenerateId)
						.onChange(async (value) => {
							this.plugin.settings.autoGenerateId = value;
							await this.plugin.saveSettings();
						}),
				);
		}

		// Filename ID settings group
		containerEl.createEl("h3", { text: "Filename ID Settings" });
		new Setting(containerEl)
			.setName("Id sources: File name")
			.setDesc("Enable id search by file name")
			.addToggle((toggle) =>
				this.toggleForIdSource(IdSource.FileName, toggle),
			);

		if (this.plugin.settings.idSources.includes(IdSource.FileName)) {
			new Setting(containerEl)
				.setName("Id filename regex")
				.setDesc(
					"Choose which regex will be used for id, first group will be used",
				)
				.addText((text) =>
					text
						.setPlaceholder("regex")
						.setValue(this.plugin.settings.idFilenameRegex)
						.onChange(async (value) => {
							this.plugin.settings.idFilenameRegex = value;
							await this.plugin.saveSettings();
						}),
				);
		}

		// Common settings group
		containerEl.createEl("h3", { text: "Common Settings" });
		new Setting(containerEl)
			.setName("Id format")
			.setDesc(
				"Choose which format will be used for generating new ids. Uses moment.js format.",
			)
			.addText((text) =>
				text
					.setPlaceholder("YYYYMMDDHHmmss")
					.setValue(this.plugin.settings.idFormat)
					.onChange(async (value) => {
						this.plugin.settings.idFormat = value;
						await this.plugin.saveSettings();
					}),
			);
	}

	private toggleForIdSource(source: IdSource, toggle: ToggleComponent) {
		toggle
			.setValue(this.plugin.settings.idSources.includes(source))
			.onChange(async (value) => {
				if (value) {
					this.plugin.settings.idSources.push(source);
				} else {
					this.plugin.settings.idSources =
						this.plugin.settings.idSources.filter(
							(s) => s != source,
						);
				}
				// Sort sources to keep order
				this.plugin.settings.idSources.sort();
				this.plugin.loadChecks();
				await this.plugin.saveSettings();

				// Toggle Redisplay
				this.display();
			});
	}
}
