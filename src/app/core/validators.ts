import { Validators } from '@angular/forms';

/**
 * Phone numbers: a leading + or digit, then at least 6 more digits, spaces or dashes
 * (e.g. +919705329960, +91 97053 29960, 040-1234567). Mirrors PHONE_RE on the server.
 */
export const PHONE_PATTERN = /^[+\d][\d\s-]{6,}$/;
export const phoneValidator = Validators.pattern(PHONE_PATTERN);
