const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repos = [
  "https://github.com/programisto/edrm-user.git",
  "https://github.com/programisto/edrm-mailer.git",
  "https://github.com/programisto/edrm-prometheus.git",
  "https://github.com/programisto/edrm-exams.git"
];

const version = process.argv[2];
if (!version) {
  console.error("❌ Missing version number (e.g., 0.5.0)");
  process.exit(1);
}

const token = process.env.GH_PAT;
if (!token) {
  console.error("❌ Missing GH_PAT");
  process.exit(1);
}

repos.forEach((repoUrl) => {
  const repoName = repoUrl.split("/").pop().replace(".git", "");
  const cloneUrl = repoUrl.replace("https://", `https://${token}@`);
  const cloneDir = path.join("/tmp", repoName);

  console.log(`🚀 Cloning ${repoName}...`);
  execSync(`git clone ${cloneUrl} ${cloneDir}`, { stdio: "inherit" });

  process.chdir(cloneDir);

  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  pkg.dependencies["@programisto/endurance-core"] = `^${version}`;
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

  execSync("npm install", { stdio: "inherit" });
  execSync("npm version patch", { stdio: "inherit" });
  execSync(`git config user.name "${process.env.GIT_AUTHOR_NAME}"`);
  execSync(`git config user.email "${process.env.GIT_AUTHOR_EMAIL}"`);
  execSync(`git commit -am "chore: bump endurance-core to ${version}"`);
  execSync(`git push origin HEAD:new-release-${version}`, { stdio: "inherit" });

  console.log(`✅ ${repoName} updated and pushed to branch new-release-${version}`);
});
