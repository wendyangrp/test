# CLAUDE.md

## Tech Stack

- Plain HTML, CSS, and JavaScript only.
- No frameworks or libraries (no React, Vue, Tailwind, etc.).
- No build step: files are opened or served exactly as written.
- A small Node.js server (`server/server.js`) uses only Node's built-in
  features, with no npm packages. It serves the pages and keeps the AI
  API key hidden from the browser.

## Project Structure

- `index.html`: portal home page that lists the tools
- `css/style.css`: shared styles and the light/dark theme colours
- `js/theme.js`: theme toggle used on every page
- `tools/<tool-name>/`: one folder per tool (its page and script)
- `server/server.js`: static file server and the `/api/...` endpoints
- `.env.example`: settings the server needs (the real `.env` is never committed)

## Key Requirements

1. Every page must be responsive and work on desktop, tablet, and phone.
2. Users can toggle between a light and a dark theme. The default is the
   light theme.

## Feature Plan

- [x] Portal home page with tool list, responsive layout, light/dark theme toggle
- [x] Tool 1: Persona Interview (set up a persona, interview it, AI replies in character)
- [ ] Hosting: choose a host and a monthly spending limit (ask first)

## Rules for Claude

- Explain technical terms in plain language.
- Ask before making big changes.
- When something is unclear, ask rather than guess.
