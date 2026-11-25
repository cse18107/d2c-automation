// A JSON value as stored in jsonb columns. Typed so callers do not reach for `any`.
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };
