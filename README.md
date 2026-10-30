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

## Put it online (Render)

The repo includes `render.yaml`, which tells [Render](https://render.com) how to run the site. Every push to `main` redeploys it automatically.

1. **Set an AI spending limit first.** In the [Anthropic Console](https://platform.claude.com), go to the billing / limits settings and set a monthly limit (for example $5). Once it's reached, the persona stops replying until next month, and nothing more is charged.
2. **Create an API key** in the Anthropic Console just for this site, so you can cancel it on its own later if you need to.
3. **Sign up at Render** with your GitHub account.
4. In Render, choose **New → Blueprint**, pick this repository, and confirm.
5. When Render asks for `ANTHROPIC_API_KEY`, paste the key from step 2.
6. Wait for the first deploy to finish. Render shows the site's address (something like `https://empathy-toolkit.onrender.com`).

**About the free plan:** the site goes to sleep after about 15 minutes with no visitors. The next visit wakes it up, which takes about 30–60 seconds. To keep it always awake, switch the service to a paid plan in Render.
