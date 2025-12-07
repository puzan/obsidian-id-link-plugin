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
	syncIdToProperty: boolean;
}

const DEFAULT_SETTINGS: IdLinkSettings = {
	idSources: [IdSource.Property, IdSource.FileName],
	idProperty: "id",
	idFilenameRegex: "^(\\d{14})[ .]",
	idFormat: "YYYYMMDDHHmmss",
	autoGenerateId: true,
	syncIdToProperty: false,
};

export default class IdLinkPlugin extends Plugin {
	settings: IdLinkSettings;
	checks: ((p: Record<string, any>, id: string) => boolean)[];
	private filenameRegex: RegExp;

	async onload() {
		await this.loadSettings();

		this.loadChecks();
		this.updateFilenameRegex();

		this.addSettingTab(new IdLinkSettingTab(this.app, this));

		// Register file save event handler
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && this.settings.syncIdToProperty) {
					this.syncIdFromFileName(file);
				}
			}),
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile)) {
					return;
				}

				menu.addItem((item) => {
					item.setTitle("Copy ID Link")
						.setIcon("link")
						.onClick(() =>
							this.generateLinkAndCopyToClipboard(file),
						);
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

				this.generateLinkAndCopyToClipboard(activeFile);
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

		this.addCommand({
			id: "copy-id",
			name: "Copy Id",
			callback: () => {
				const activeFile = this.app.workspace.getActiveFile();

				if (!activeFile) {
					new Notice("No active file");
					return;
				}

				const id = this.findId(activeFile);

				if (!id) {
					new Notice("No ID found in the file");
					return;
				}

				navigator.clipboard.writeText(id);
				new Notice(`ID copied to clipboard: ${id}`);
			},
		});

		this.registerObsidianProtocolHandler("id-link", (params) => {
			const dvApi = this.getDataViewApi();

			const id = params["id"];
			if (!id) {
				this.showErrorAndThrow("Id is missed in link");
			}

			// Try to find file by using Dataview
			let path: string | undefined = dvApi
				.pages()
				.where((p: Record<string, any>) =>
					this.checks.some((check) => check(p, id)),
				)
				.first()?.file.path;

			// Try to find file by filename using native Obsidian API only if file was not found by property
			if (!path && this.settings.idSources.includes(IdSource.FileName)) {
				const files = this.app.vault.getFiles();
				const file = files.find((file) => {
					return this.findIdInFileName(file.name) === id;
				});
				path = file?.path;
			}

			if (!path) {
				this.showErrorAndThrow(`Page with id ${id} is not found`);
			}

			const blockId = params["block-id"];
			if (blockId) {
				path += `#^${blockId}`;
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
		this.updateFilenameRegex();
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
					return (p: Record<string, any>, id: string) =>
						this.findIdInFileName(p.file.name) === id;
				}
			}
		});
	}

	updateFilenameRegex() {
		this.filenameRegex = new RegExp(this.settings.idFilenameRegex);
	}

	private findIdInFileName(fileName: string): string | undefined {
		return this.filenameRegex.exec(fileName)?.[1];
	}

	private findIdInProperty(file: TFile): string | undefined {
		const cache = this.app.metadataCache.getFileCache(file);
		return cache?.frontmatter?.[this.settings.idProperty];
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

	private async generateLinkAndCopyToClipboard(file: TFile): Promise<void> {
		const link = await this.findIdAndGenerateLink(file);
		if (!link) {
			new Notice("No ID found in the file");
			return;
		}

		navigator.clipboard.writeText(link);
		new Notice("ID link copied to clipboard");
	}

	private findId(file: TFile): string | undefined {
		let id: string | undefined;

		// Try to find ID from property
		if (this.settings.idSources.includes(IdSource.Property)) {
			id = this.findIdInProperty(file);
		}

		// Try to find ID from filename if not found in property
		if (!id && this.settings.idSources.includes(IdSource.FileName)) {
			id = this.findIdInFileName(file.name);
		}

		return id?.toString();
	}

	async findIdAndGenerateLink(file: TFile): Promise<string | undefined> {
		let id = this.findId(file);

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
			return undefined;
		}

		return this.generateIdLink(id);
	}

	private async syncIdFromFileName(file: TFile): Promise<void> {
		if (
			!this.settings.idSources.includes(IdSource.FileName) ||
			!this.settings.idSources.includes(IdSource.Property)
		) {
			return;
		}

		const propertyId = this.findIdInProperty(file);
		const fileNameId = this.findIdInFileName(file.name);

		if (!fileNameId) {
			return;
		}

		if (!propertyId || propertyId !== fileNameId) {
			await this.saveIdToProperty(file, fileNameId);
		}
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
							this.plugin.updateFilenameRegex();
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

		if (
			this.plugin.settings.idSources.includes(IdSource.Property) &&
			this.plugin.settings.idSources.includes(IdSource.FileName)
		) {
			new Setting(containerEl)
				.setName("Sync ID from filename to property")
				.setDesc(
					"Automatically sync ID from filename to property when both sources are enabled. Updates property if IDs differ.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.syncIdToProperty)
						.onChange(async (value) => {
							this.plugin.settings.syncIdToProperty = value;
							await this.plugin.saveSettings();
						}),
				);
		}
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
