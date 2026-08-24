import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/dom";

// Full-suite runs spawn many parallel jsdom workers; the default 1000ms
// waitFor() timeout can be starved under that load even though individual
// tests are correct. Raise it so CI-style full-suite runs are not flaky.
configure({ asyncUtilTimeout: 4000 });
