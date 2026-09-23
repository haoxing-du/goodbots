import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Keep the model catalog in step with OpenRouter (new launches show up within hours).
crons.interval("sync OpenRouter catalog", { hours: 6 }, internal.catalog.sync);

// Delete screenshots that were uploaded but never posted.
crons.interval("clean up unposted uploads", { hours: 6 }, internal.uploads.cleanup);

// Site analytics for the admin page: today every 10 minutes, and the last
// 9 days hourly (activation and deletions keep changing older days a little).
crons.interval("roll up today's analytics", { minutes: 10 }, internal.analytics.refreshToday);
crons.interval("roll up analytics", { hours: 1 }, internal.analytics.refresh);

export default crons;
