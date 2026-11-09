// Drop the controlling terminal so CLI prompts cannot hang piped tests.
export const DETACHED = { detached: true } as const;
