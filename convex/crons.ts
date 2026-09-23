import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Keep the model catalog in step with OpenRouter (new launches show up within hours).
crons.interval("sync OpenRouter catalog", { hours: 6 }, internal.catalog.sync);

export default crons;
