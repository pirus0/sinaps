// Bridge between main.js (which owns the app state) and the feature modules split out of it.
// main.js defines a getter (and a setter for reassignable state) for every name used as app.<name>.
export const app = {};
