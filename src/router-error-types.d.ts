import "@tanstack/router-core";

// Route error boundaries in this app receive Error instances.
declare module "@tanstack/router-core" {
  interface ErrorBoundaryTypes {
    error: Error;
  }
}
