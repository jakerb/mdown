---
name: Mdown
author: Jake Bown
website: https://jakebown.com
coffee: https://buymeacoffee.com/jakebown
---

# Welcome to {{name}}

{{name}} is a focused Markdown editor for macOS. Your notes remain ordinary `.md` files, so they stay portable, readable, and yours.

If {{name}} is useful to you, you can [buy me a coffee]({{coffee}}). Thank you for supporting the project.

## Write without getting in the way

Use the editor for distraction-free writing, then choose **View → Toggle Preview** when you want to see the rendered document. Open and save files with the standard macOS File menu.

## AI writing assistant

Add an OpenAI API key through the **AI** button in the bottom bar. The key stays locally in `~/mdown.config.json`.

Select text, right-click, and choose:

- **Improve** — tighten clarity, flow, and concision.
- **Rewrite** — create a fresh version while keeping the meaning.
- **Prompt…** — open the AI sidebar to ask questions about the selected text or the whole document.

The sidebar keeps a conversation visible for follow-up questions and does not change your text. You can edit prompts—or add your own selection actions—from **Edit → Edit Config…**.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘N` | New window |
| `⌘O` | Open Markdown file |
| `⌘S` | Save |
| `⌘⇧S` | Save As |
| `⌘⇧I` | Toggle AI sidebar |
| `⌘⇧P` | Toggle Preview |
| `⌘⇧D` | Toggle Dark Mode |
| `⌘⇧L` | Toggle Line Numbers |
| `⌘+` / `⌘-` | Change editor font size |
| `Esc` | Close the AI sidebar |

## Markdown basics

```markdown
# Heading one
## Heading two

Write **bold**, *italic*, and `inline code`.

- A bullet
- Another bullet

1. A numbered item
2. Another item

[A link](https://example.com)

> A useful quotation.
```

## Frontmatter and reusable values

Put a small frontmatter block at the very top of a note, then reuse its values with double braces. Frontmatter is hidden in Preview.

```markdown
---
project: Mdown
author: Ada
---

# {{project}}

Written by {{author}}.
```

Happy writing.

---
