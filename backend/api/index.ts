/**
 * Vercel serverless entry (optional path if Render is unavailable).
 * Express app is exported as the request handler.
 */
import { createApp } from "../src/app.js";

const app = createApp();

export default app;
