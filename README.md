# Obsidian ID Link Plugin

A plugin for Obsidian that allows you to create and use ID-based links to notes using unique identifiers (IDs) stored either in frontmatter or filename. This plugin helps you maintain stable references between notes by using IDs instead of file names, allowing the generated links to work outside of Obsidian and continue functioning even after file renaming.

## Installation

### From BRAT

1. Install BRAT plugin from Obsidian Community Plugins
2. Open BRAT settings
3. Add "puzan/obsidian-id-link" to the "Beta plugin list"
4. Go to Community Plugins
5. Enable "ID Link" plugin

### Manual Installation

1. Download the latest release from the releases page
2. Extract the files into your vault's plugins folder: `<vault>/.obsidian/plugins/obsidian-id-link-plugin/`
3. Reload Obsidian
4. Enable the plugin in Settings > Community Plugins

## Features

### ID Sources

The plugin can find IDs from two sources (configurable in settings):

1. **Frontmatter Property**: Looks for an ID in the note's frontmatter (default property name is "id")
2. **Filename**: Extracts ID from any file's filename using a regex pattern (default pattern is "^(\\d{14}) "). This works for all file types, not just markdown files.

### Generating ID Links

The plugin provides two ways to generate ID links:

- Through Command Palette (`Cmd/Ctrl + P`): "Copy ID Link"
- Through file context menu (right-click on a note)

In both cases, the generated link will be automatically copied to your clipboard.

Generated links follow this format:

```
obsidian://id-link?vault=<vault-name>&id=<note-id>
```

### Copying IDs

The plugin provides a command to copy just the ID (without generating a link):

- Through Command Palette (`Cmd/Ctrl + P`): "Copy Id"
- The ID will be automatically copied to your clipboard and displayed in a notice

### Automatic ID Generation

When using the Frontmatter Property source, the plugin can automatically generate and save a new ID if one is not found. The generated ID follows a configurable format using moment.js date formatting.

### Generate New ID

The plugin provides a command to generate a new ID in the configured format:

- Through Command Palette (`Cmd/Ctrl + P`): "Generate New ID"
- The generated ID will be automatically copied to your clipboard and displayed in a notice

### ID Synchronization

When both ID sources (Frontmatter Property and Filename) are enabled, the plugin can automatically synchronize IDs between them:

- If an ID exists in the filename but not in the frontmatter, it will be added to the frontmatter
- If IDs exist in both places but differ, the ID from the filename will be used to update the frontmatter
- Synchronization happens automatically when a file is saved

## Settings

You can configure the plugin in Settings > ID Link:

- **Id Sources**: Enable/disable searching for IDs in frontmatter and filenames
- **Id format**: Configure the format for generated IDs using moment.js date format (default: "YYYYMMDDHHmmss")
- **Sync ID from filename to property**: When both ID sources are enabled, automatically sync IDs from filename to frontmatter property on file save

### Property ID Settings

- **Id property**: Set the frontmatter property name to use for IDs
- **Auto generate ID**: Automatically generate and save a new ID if not found

### Filename ID Settings

- **Id filename regex**: Configure the regex pattern to extract IDs from filenames

## Requirements

- Obsidian v0.15.0 or higher
- Dataview plugin (for ID-based navigation)

## Development

This plugin is built using TypeScript and requires Node.js v16 or higher.

To set up the development environment:

1. Clone the repository
2. Run `npm install`
3. Run `npm run dev` to start compilation in watch mode
4. Make changes to `main.ts`
5. Reload Obsidian to test changes

### Releasing

To prepare a new release run command:

```bash
npm run release
```

This will:

- Run ESLint and Prettier to ensure code quality
- Analyze commits since last tag using conventional commits
- Determine version bump type (major/minor/patch) based on commit types:
   - `feat!` or `BREAKING CHANGE:` → major
   - `feat:` → minor
   - `fix:` and others → patch
- Bump version in package.json
- Update manifest.json and versions.json
- Create a git commit with version tag
- Push changes and tags to remote
- Create/update GitHub release with changelog

Note: Make sure your commits follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for automatic version determination to work correctly.
