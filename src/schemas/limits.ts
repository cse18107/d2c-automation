// Text limits for generated copy. One source for the Zod schemas and the policy
// checks (spec §8, "platform copy derives from validate() rules"). These are the
// Amazon-style limits chosen for the first listing target (spec Q3); platform
// adapters will replace them when connectors exist.
export const LISTING_LIMITS = {
  titleMax: 200,
  bulletCount: 5,
  bulletMax: 500,
  descriptionMax: 2000,
  keywordCount: 10,
  keywordMax: 50,
} as const;

// Ad copy limits (Meta-style text lengths, spec §2).
export const AD_COPY_LIMITS = {
  headlineCount: 3,
  headlineMax: 40,
  primaryTextCount: 2,
  primaryTextMax: 125,
  hashtagCount: 10,
  hashtagMax: 30,
} as const;

// Short-form video (spec §2, CLAUDE.md §8): 6–15 s per clip.
export const VIDEO_LIMITS = {
  minSeconds: 6,
  maxSeconds: 15,
  sceneCount: 5,
  sceneMax: 600,
  captionMax: 60,
  endCardMax: 40,
  videosPerProductMin: 1,
  videosPerProductMax: 3,
} as const;
