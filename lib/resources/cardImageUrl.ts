/** Where a saved card image is served (public, by its unguessable key). */
export const cardImageUrl = (key: string) => `/api/card-images/${key}`;
