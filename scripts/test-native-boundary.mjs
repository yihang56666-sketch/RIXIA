import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot, run } from "./release-utils.mjs";

const androidRoot = path.join(projectRoot, "android");
await run(path.join(androidRoot, process.platform === "win32" ? "gradlew.bat" : "gradlew"), [
  "--offline", "--no-daemon", "-p", androidRoot, "-I", path.join(projectRoot, "scripts", "native-audit.init.gradle"),
  "nativeAuditClasspath", "--console=plain",
]);
const classpath = readFileSync(path.join(androidRoot, "build", "native-audit-test-classpath.txt"), "utf8").trim();
const mockitoAgent = classpath.split(path.delimiter).find((entry) => /^mockito-core-[\d.]+\.jar$/.test(path.basename(entry)));
if (!mockitoAgent) throw new Error("Mockito test agent is missing from the offline test classpath");
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java") : "java";
await run(java, [`-javaagent:${mockitoAgent}`, "-cp", classpath, "org.junit.runner.JUnitCore", "com.beid.app.NativeBoundaryTest"]);
