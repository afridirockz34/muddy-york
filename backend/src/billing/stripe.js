import Stripe from "stripe";
import { config } from "../config.js";
let _stripe = null;
export function getStripe() {
  // A placeholder key lets the client construct (and verify webhook signatures,
  // which don't use the API key) even before STRIPE_SECRET_KEY is configured.
  // Real API calls still require a valid key set in the environment.
  if (!_stripe) _stripe = new Stripe(config.stripe.secretKey || "sk_test_placeholder");
  return _stripe;
}
