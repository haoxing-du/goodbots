import { ConvexError } from "convex/values";
import {
  englishDataset,
  englishRecommendedTransformers,
  RegExpMatcher,
} from "obscenity";

// Basic profanity/slur filter for public identifiers: axis names and
// descriptions, handles and display names. Review text is not filtered.
// It handles leetspeak and repeated letters; admins can hide anything it misses.
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export function assertClean(text: string | undefined, what: string) {
  if (text && matcher.hasMatch(text)) {
    throw new ConvexError(`That ${what} isn’t allowed. Try something else.`);
  }
}
