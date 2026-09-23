/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as featured from "../featured.js";
import type * as home from "../home.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as magicLink from "../magicLink.js";
import type * as models from "../models.js";
import type * as moderation from "../moderation.js";
import type * as og from "../og.js";
import type * as reactions from "../reactions.js";
import type * as requests from "../requests.js";
import type * as reviews from "../reviews.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as setup from "../setup.js";
import type * as takes from "../takes.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  catalog: typeof catalog;
  crons: typeof crons;
  featured: typeof featured;
  home: typeof home;
  http: typeof http;
  lib: typeof lib;
  magicLink: typeof magicLink;
  models: typeof models;
  moderation: typeof moderation;
  og: typeof og;
  reactions: typeof reactions;
  requests: typeof requests;
  reviews: typeof reviews;
  search: typeof search;
  seed: typeof seed;
  setup: typeof setup;
  takes: typeof takes;
  uploads: typeof uploads;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
