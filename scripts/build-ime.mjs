import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
const sdk = process.env.ANDROID_SDK_ROOT;
if (!sdk)
  throw new Error(
    "Set ANDROID_SDK_ROOT to an operator-installed SDK. No downloads or license acceptance are automatic.",
  );
const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin") : "";
const command = (name) => (java ? join(java, name) : name);
const bt = join(sdk, "build-tools", "35.0.0"),
  jar = join(sdk, "platforms", "android-35", "android.jar");
const fixture = process.argv.includes("--fixture");
const accessibility = process.argv.includes("--accessibility");
const component = fixture ? "fixture" : accessibility ? "accessibility" : "ime";
const root = resolve(`android/${component}`),
  out = join(root, "build");
mkdirSync(join(out, "classes"), { recursive: true });
const run = (file, args, cwd = root) =>
  execFileSync(file, args, { cwd, stdio: "inherit" });
run(command("javac"), [
  "--release",
  "8",
  "-encoding",
  "UTF-8",
  "-cp",
  jar,
  "-d",
  join(out, "classes"),
  join(
    root,
    fixture
      ? "src/dev/androiduse/fixture/FixtureActivity.java"
      : accessibility ? "src/dev/androiduse/accessibility/HierarchyService.java" : "src/dev/androiduse/ime/UnicodeIme.java",
  ),
]);
const classes = join(
  out,
  `classes/dev/androiduse/${component}`,
);
run(command("java"), [
  "-cp",
  join(bt, "lib/d8.jar"),
  "com.android.tools.r8.D8",
  "--lib",
  jar,
  "--min-api",
  "23",
  "--output",
  out,
  ...readdirSync(classes)
    .filter((x) => x.endsWith(".class"))
    .map((x) => join(classes, x)),
]);
run(join(bt, "aapt"), [
  "package",
  "-f",
  "-M",
  join(root, "AndroidManifest.xml"),
  ...(!fixture ? ["-S", join(root, "res")] : []),
  "-I",
  jar,
  "-F",
  join(out, "unsigned.apk"),
]);
run(join(bt, "aapt"), ["add", "unsigned.apk", "classes.dex"], out);
run(join(bt, "zipalign"), [
  "-f",
  "4",
  join(out, "unsigned.apk"),
  join(out, "aligned.apk"),
]);
const key = join(out, "development-signing.jks");
if (!existsSync(key))
  run(command("keytool"), [
    "-genkeypair",
    "-keystore",
    key,
    "-storepass",
    "android",
    "-keypass",
    "android",
    "-alias",
    "development",
    "-keyalg",
    "RSA",
    "-keysize",
    "2048",
    "-validity",
    "365",
    "-dname",
    "CN=Android Use Development",
  ]);
run(command("java"), [
  "-jar",
  join(bt, "lib/apksigner.jar"),
  "sign",
  "--ks",
  key,
  "--ks-pass",
  "pass:android",
  "--key-pass",
  "pass:android",
  "--out",
  join(out, `android-use-${component}.apk`),
  join(out, "aligned.apk"),
]);
run(command("java"), [
  "-jar",
  join(bt, "lib/apksigner.jar"),
  "verify",
  "--verbose",
  join(out, `android-use-${component}.apk`),
]);
