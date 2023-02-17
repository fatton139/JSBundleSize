const core = require("@actions/core");
const exec = require("@actions/exec");
const github = require("@actions/github");
const { markdownTable } = require("markdown-table");

const GITHUB_ACTIONS_USER_NAME = "github-actions[bot]";
const GITHUB_ACTIONS_USER_TYPE = "Bot";
const GITHUB_ACTIONS_COMMENT_START_TEXT =
  "Bundled size for the files is listed below:";

async function findComment(octokit, { owner, issue_number, repo }) {
  for await (const { data: comments } of octokit.paginate.iterator(
    octokit.rest.issues.listComments,
    {
      repo,
      owner,
      issue_number,
    }
  )) {
    // Search each page for the comment
    const comment = comments.find((comment) => {
      return (
        comment.user.login === GITHUB_ACTIONS_USER_NAME &&
        comment.user.type === GITHUB_ACTIONS_USER_TYPE &&
        comment.body.startsWith(GITHUB_ACTIONS_COMMENT_START_TEXT)
      );
    });

    if (comment) {
      return comment;
    }
  }
}

function bytesToSize(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 Byte";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

async function getSizeOutput(path) {
  const outputOptions = {};
  let sizeCalOutput = "";

  outputOptions.listeners = {
    stdout: (data) => {
      sizeCalOutput += data.toString();
    },
    stderr: (data) => {
      sizeCalOutput += data.toString();
    },
  };
  await exec.exec(`du ${path} --max-depth=1`, null, outputOptions);
  core.setOutput("size", sizeCalOutput);

  const arrayOutput = sizeCalOutput.split("\n");

  return arrayOutput.forEach((item) => {
    const [byteSize, , fileName] = item.split(/(\s+)/);
    return [fileName, byteSize];
  });
}

function makeNoDiffTable(sizes) {

  console.log("---", sizes)

  const tableHeader = ["File", "File Size"];
  const table = [tableHeader];
  let totalSize = 0;
  sizes.forEach(([file, size]) => {
    const byteSize = Number(size) * 1000;
    totalSize += size;
    table.push([`**${file}**`, String(bytesToSize(byteSize))]);
  });

  table.push(["Total", String(bytesToSize(totalSize))]);
  return table;
}

function getDeltaString(delta) {
  return delta === 0
    ? `No change`
    : `${delta > 0 ? "+" : "-"}${bytesToSize(Math.abs(delta))} ${
        delta > 0 ? "🔼" : "🔽"
      }`;
}

function makeDiffTable(sizes, diffSizes) {
  const diffMap = new Map();
  diffSizes.forEach(([file, size]) => {
    diffMap.set(file, size);
  });

  const tableHeader = ["File", "File Size", "Diff File Size", "Delta"];
  const table = [tableHeader];
  let totalSize = 0;
  let totalDiffSize = 0;
  sizes.forEach(([file, size]) => {
    const diffSize = diffMap.get(file);
    const byteSize = Number(size) * 1000;
    if (diffSize !== undefined) {
      const diffByteSize = Number(diffSize) * 1000;
      const delta = byteSize - diffByteSize;
      totalSize += size;
      totalDiffSize += diffByteSize;
      table.push([
        `**${file}**`,
        bytesToSize(byteSize),
        bytesToSize(diffByteSize),
        getDeltaString(delta),
      ]);
    } else {
      table.push([
        `**${file}**`,
        bytesToSize(byteSize),
        "-",
        getDeltaString(totalSize - totalDiffSize),
      ]);
    }
  });

  table.push(["Total", String(bytesToSize(totalSize))]);
  return table;
}

async function run() {
  try {
    // --------------- octokit initialization  ---------------
    const token = core.getInput("token");
    const updateComment = core.getBooleanInput("update_comment");
    const octokit = new github.getOctokit(token);

    const path = core.getInput("path");
    const diffPath = core.getInput("diff_path");

    const context = github.context;
    const pullRequest = context.payload.pull_request;
    const owner = context.payload.repository.owner.login;
    const repo = context.payload.repository.name;

    const arrayOutput = await getSizeOutput(path);

    const table = diffPath
      ? makeDiffTable(arrayOutput, await getSizeOutput(diffPath))
      : makeNoDiffTable(arrayOutput);

    const markdownTableStr = markdownTable(table);
    const markdown = `
<details> \n
<summary>Bundled size for the files is listed below:</summary> \n
<br> \n
${markdownTableStr} \n
</details>
`;

    if (pullRequest) {
      const existingComment = await findComment(octokit, {
        owner,
        issue_number: pullRequest.number,
        repo,
      });
      // If the comment exists then update instead of creating a new one.
      if (existingComment && updateComment) {
        await octokit.rest.issues.updateComment({
          owner,
          repo,
          comment_id: existingComment.id,
          body: markdown,
        });
      } else {
        // on pull request commit push add comment to pull request
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pullRequest.number,
          body: markdown,
        });
      }
    } else {
      core.notice("Did not run since we're not in a PR.");
    }

    // --------------- End Comment repo size  ---------------
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
