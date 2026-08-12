// Pure Cloudinary signature builder. Cloudinary signs an upload by taking the
// request params (excluding file, cloud_name, api_key, resource_type), sorting
// them by key, joining as `k=v` with `&`, appending the API secret, and hashing
// with SHA-1. Kept pure by injecting the sha1 function so it is trivially
// testable without Node's crypto in the test environment.
export function signaturePayload(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

// sha1 is injected: (string) => hex string. Returns the hex signature.
export function cloudinarySignature(params, secret, sha1) {
  return sha1(signaturePayload(params) + secret);
}
