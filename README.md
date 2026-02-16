# Claw2Agent Skills

Official skill package repository for the Claw2Agent platform.

## Overview

This repository contains the official collection of skills (plugins) for Claw2Agent. Each skill extends the agent's capabilities by providing specialized functionality such as web search, data analysis, file management, and more.

## Directory Structure

```
claw2agent-skills/
├── README.md              # Project documentation
├── LICENSE                 # MIT License
├── package.json           # Package configuration
├── registry.json          # Skill index and metadata registry
├── skills/                # All skill packages
│   ├── <skill-name>/
│   │   ├── skill.json     # Skill metadata and configuration
│   │   ├── handler.js     # Skill implementation
│   │   └── README.md      # Skill documentation
│   └── ...
└── templates/             # Templates for creating new skills
    ├── skill.json.template
    └── handler.js.template
```

## Adding a New Skill

### 1. Create the skill directory

```bash
mkdir skills/<your-skill-name>
```

### 2. Required files

Every skill must include the following three files:

| File | Description |
|------|-------------|
| `skill.json` | Skill metadata — name, description, category, version, author, dependencies, and config schema |
| `handler.js` | Skill implementation — exports `meta`, `execute(context)`, and `validate(config)` |
| `README.md` | Skill documentation — usage instructions, examples, and configuration details |

### 3. Use the templates

Copy the templates as a starting point:

```bash
cp templates/skill.json.template skills/<your-skill-name>/skill.json
cp templates/handler.js.template skills/<your-skill-name>/handler.js
```

Then edit the files to implement your skill logic.

### 4. Register the skill

Add your skill entry to `registry.json` under the `skills` object:

```json
{
  "version": "1.0.0",
  "skills": {
    "your-skill-name": {
      "version": "1.0.0",
      "path": "skills/your-skill-name",
      "description": "A brief description of your skill",
      "category": "utility"
    }
  }
}
```

## Installation

```bash
npm install
```

## Usage

```js
const registry = require('./registry.json');
const skill = require(`./skills/${skillName}/handler`);

// Validate configuration
skill.validate(config);

// Execute the skill
const result = await skill.execute(context);
```

## License

MIT
