/** URL-safe slug for client/vendor names in document routes. */
export function entitySlug(name: string): string {
  return encodeURIComponent(name.trim());
}

export function decodeEntitySlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}
