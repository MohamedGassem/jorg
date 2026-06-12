/**
 * Verrous fonctionnels de la phase alpha privée.
 *
 * Centralise les fonctionnalités volontairement désactivées le temps de l'alpha,
 * pour pouvoir les rouvrir d'un seul endroit à la fin de la phase.
 */
export const ALPHA = true;

/** L'édition de mission sera ouverte après l'alpha (la création reste possible). */
export const OPPORTUNITY_EDIT_ENABLED = !ALPHA;
