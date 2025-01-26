import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	ToggleComponent,
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
}

const DEFAULT_SETTINGS: IdLinkSettings = {
	idSources: [IdSource.Property, IdSource.FileName],
	idProperty: "id",
	idFilenameRegex: "^(\\d{14}) ",
};

export default class IdLinkPlugin extends Plugin {
	settings: IdLinkSettings;
	checks: ((p: Record<string, any>, id: string) => boolean)[];

	async onload() {
		await this.loadSettings();

		this.loadChecks();

		this.addSettingTab(new IdLinkSettingTab(this.app, this));

		this.registerObsidianProtocolHandler("id-link", (params) => {
			const dvApi = this.getDataViewApi();

			const id = params["id"];
			if (!id) {
				this.showErrorAndThrow("Id is missed in link");
			}

			const path = dvApi
				.pages()
				.where((p) => this.checks.some((check) => check(p, id)))
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
						regex.exec(p.file.path)?.[1] == id;
				}
			}
		});
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

		new Setting(containerEl)
			.setName("Id sources: Property")
			.setDesc("Enable id search by property")
			.addToggle((toggle) =>
				this.toggleForIdSource(IdSource.Property, toggle),
			);

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
			.setName("Id sources: File name")
			.setDesc("Enable id search by file name")
			.addToggle((toggle) =>
				this.toggleForIdSource(IdSource.FileName, toggle),
			);

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
			});
	}
}
