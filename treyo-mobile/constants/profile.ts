/**
 * The shortest bio a trainer may have — on onboarding and in edit profile,
 * and checked again by the server (TrainerService.BIO_MIN). Raised from 50
 * to 100 in October 2026: learners choose trainers partly on it, and 50
 * characters was a sentence. Counted without surrounding spaces.
 */
export const TRAINER_BIO_MIN = 100;
