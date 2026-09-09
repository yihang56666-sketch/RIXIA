import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

test("persisted alarms restore after an app update without expanding permissions", () => {
  const manifest = readFileSync(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  assert.match(manifest, /android\.intent\.action\.MY_PACKAGE_REPLACED/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.doesNotMatch(manifest, /android\.permission\.(READ_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|USE_EXACT_ALARM)/);
});

test("instrumented package assertion matches the application that is actually built", () => {
  const build = readFileSync(new URL("../android/app/build.gradle", import.meta.url), "utf8");
  const instrumentation = readFileSync(new URL("../android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java", import.meta.url), "utf8");
  const appId = build.match(/applicationId\s+"([^"]+)"/)[1];
  const expected = instrumentation.match(/assertEquals\("([^"]+)", appContext\.getPackageName\(\)\)/)[1];
  assert.equal(expected, appId);
});
