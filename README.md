# Empathy Toolkit

Small web tools that help students practise the empathy stage of design thinking.

**Tools**

- **Persona Interview**: describe a persona, then interview them. An AI answers in character.

## Run it locally

You need [Node.js](https://nodejs.org) 20.12 or newer. There is nothing to install.

1. Copy the settings file and add your Anthropic API key:

   ```bash
   cp .env.example .env
   ```

   Then open `.env` and fill in `ANTHROPIC_API_KEY=`.

2. Start the server:

   ```bash
   npm start
   ```

3. Open <http://localhost:3000> in your browser.

The portal pages work without a key; only the Persona Interview replies need it.
