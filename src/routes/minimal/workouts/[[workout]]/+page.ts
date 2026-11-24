// Only the omitted prescription has a file on Pages. Other prescriptions boot
// the client router from the adapter's 404.html at the original request URL.
export const prerender = 'auto';
export const entries = () => [{}];
