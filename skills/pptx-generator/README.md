# PPTX Generator

Generate PowerPoint presentation data structures (JSON-based slide definitions). Pure local computation with no external API calls.

> **Note:** This is a pure computation skill that works on in-memory presentation data. No external dependencies required.

## Features

- **Create Presentation** - Create a new presentation structure with title, author, and theme
- **Add Slide** - Add slides with different layouts (title, content, two_column, image, blank)
- **Add Text** - Add styled text elements to slides with positioning and formatting options
- **Add Image** - Add image placeholders to slides with URL reference and positioning
- **Get Presentation** - Retrieve the full presentation data structure
- **List Presentations** - List all presentations currently in memory

## Usage

### Create a presentation

```json
{
  "action": "create_presentation",
  "title": "Q4 Sales Report",
  "author": "Jane Doe",
  "theme": "corporate"
}
```

### Add a slide

```json
{
  "action": "add_slide",
  "presentationId": "<id>",
  "layout": "title",
  "title": "Welcome",
  "body": "Quarterly review for stakeholders",
  "notes": "Introduce the team first"
}
```

### Add text to a slide

```json
{
  "action": "add_text",
  "presentationId": "<id>",
  "slideIndex": 0,
  "text": "Revenue grew 15% year-over-year",
  "options": {
    "bold": true,
    "fontSize": 24,
    "color": "#003366",
    "x": 50,
    "y": 100,
    "width": 500,
    "height": 40
  }
}
```

### Add an image to a slide

```json
{
  "action": "add_image",
  "presentationId": "<id>",
  "slideIndex": 0,
  "imageUrl": "https://example.com/chart.png",
  "options": {
    "alt": "Revenue chart",
    "x": 100,
    "y": 200,
    "width": 400,
    "height": 300
  }
}
```

### Get a presentation

```json
{
  "action": "get_presentation",
  "presentationId": "<id>"
}
```

### List all presentations

```json
{
  "action": "list_presentations"
}
```

## Parameters

| Parameter        | Type   | Required | Description                                                                                 |
|------------------|--------|----------|---------------------------------------------------------------------------------------------|
| `action`         | string | Yes      | One of: `create_presentation`, `add_slide`, `add_text`, `add_image`, `get_presentation`, `list_presentations` |
| `title`          | string | Varies   | Presentation title (required for `create_presentation`); slide title (optional for `add_slide`) |
| `author`         | string | No       | Author name (for `create_presentation`)                                                     |
| `theme`          | string | No       | Theme: `default`, `dark`, `corporate`, `minimal` (default: `default`)                       |
| `presentationId` | string | Varies   | Presentation ID (required for all actions except `create_presentation` and `list_presentations`) |
| `layout`         | string | No       | Slide layout: `title`, `content`, `two_column`, `image`, `blank` (default: `content`)       |
| `body`           | string | No       | Slide body text (for `add_slide`)                                                           |
| `notes`          | string | No       | Speaker notes (for `add_slide`)                                                             |
| `slideIndex`     | number | Varies   | 0-based slide index (required for `add_text` and `add_image`)                               |
| `text`           | string | Varies   | Text content, max 5000 chars (required for `add_text`)                                      |
| `imageUrl`       | string | Varies   | Valid HTTP/HTTPS URL (required for `add_image`)                                             |
| `options`        | object | No       | Formatting/positioning options (for `add_text` and `add_image`)                             |

### Text Options

| Option     | Type    | Default   | Description         |
|------------|---------|-----------|---------------------|
| `bold`     | boolean | `false`   | Bold text           |
| `italic`   | boolean | `false`   | Italic text         |
| `fontSize` | number  | `18`      | Font size in points |
| `color`    | string  | `#000000` | Text color (hex)    |
| `x`        | number  | `0`       | X position          |
| `y`        | number  | `0`       | Y position          |
| `width`    | number  | `600`     | Element width       |
| `height`   | number  | `40`      | Element height      |

### Image Options

| Option   | Type   | Default | Description       |
|----------|--------|---------|-------------------|
| `alt`    | string | `""`    | Alt text          |
| `x`      | number | `0`     | X position        |
| `y`      | number | `0`     | Y position        |
| `width`  | number | `400`   | Element width     |
| `height` | number | `300`   | Element height    |

## Response Format

All actions return an object with:

- `result` - Human-readable formatted text output
- `metadata` - Structured data including `success`, `action`, and action-specific fields

## Requirements

- No API key required
- No external dependencies
- Works entirely offline with pure local computation
