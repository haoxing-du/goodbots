import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Keep the model catalog in step with OpenRouter (new launches show up within hours).
crons.interval("sync OpenRouter catalog", { hours: 6 }, internal.catalog.sync);

// Delete screenshots that were uploaded but never posted.
crons.interval("clean up unposted uploads", { hours: 6 }, internal.uploads.cleanup);

// Recount recent days of site analytics for the admin page.
crons.interval("roll up analytics", { hours: 1 }, internal.analytics.refresh);

export default crons;
