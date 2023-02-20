const fs = require("fs");
const path = require("path");
const core = require("@actions/core");
const github = require("@actions/github");
const { markdownTable } = require("markdown-table");
const micromatch = require("micromatch");

const GITHUB_ACTIONS_USER_NAME = "github-actions[bot]";
const GITHUB_ACTIONS_USER_TYPE = "Bot";
const GITHUB_ACTIONS_COMMENT_START_TEXT = `
<details> \n
<summary>Bundled size for the files is listed below:</summary> \n
`;

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

async function getSizeOutputForDir(dirOrFile) {
  const isDir = (await fs.promises.stat(dirOrFile)).isDirectory();

  if (isDir) {
    const dir = dirOrFile;
    core.debug(`Mapping file sizes for ${dir} ...`);
    const files = await fs.promises.readdir(dir);
    return (
      await Promise.all(
        files.map((file) =>
          Promise.all([file, fs.promises.stat(path.join(dir, file))])
        )
      )
    )
      .filter(([, stats]) => !stats.isDirectory())
      .map(([file, stats]) => [file, stats.size]);
  }

  const file = dirOrFile;

  return [[file, (await fs.promises.stat(file)).size]];
}

function makeNoDiffTable(sizes) {
  const tableHeader = ["File", "File Size"];
  const table = [tableHeader];
  let totalSize = 0;
  sizes.forEach(([file, byteSize]) => {
    totalSize += byteSize;
    table.push([`**${file}**`, bytesToSize(byteSize)]);
  });

  table.push(["Total", bytesToSize(totalSize)]);
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
  sizes.forEach(([file, byteSize]) => {
    const diffByteSize = diffMap.get(file);
    if (diffByteSize !== undefined) {
      const delta = byteSize - diffByteSize;
      totalSize += byteSize;
      totalDiffSize += diffByteSize;
      table.push([
        `**${file}**`,
        bytesToSize(byteSize),
        bytesToSize(diffByteSize),
        getDeltaString(delta),
      ]);
    } else {
      table.push([`**${file}**`, bytesToSize(byteSize), "-", "-"]);
    }
  });

  table.push([
    "Total",
    bytesToSize(totalSize),
    bytesToSize(totalDiffSize),
    getDeltaString(totalSize - totalDiffSize),
  ]);
  return table;
}

async function run() {
  try {
    // --------------- octokit initialization  ---------------
    const token = core.getInput("token");
    const updateComment = core.getBooleanInput("update_comment");
    const path = core.getInput("path");
    const diffPath = core.getInput("diff_path");
    const fileGlobPattern = core.getMultilineInput("file_glob_pattern");

    const octokit = new github.getOctokit(token);

    const context = github.context;
    const pullRequest = context.payload.pull_request;
    const owner = context.payload.repository.owner.login;
    const repo = context.payload.repository.name;

    const arrayOutput = await getSizeOutputForDir(path);

    const filteredOutput = arrayOutput.filter(([file]) =>
      micromatch.isMatch(file, fileGlobPattern)
    );

    const table = diffPath
      ? makeDiffTable(filteredOutput, await getSizeOutputForDir(diffPath))
      : makeNoDiffTable(filteredOutput);

    const markdownTableStr = markdownTable(table);

    core.debug("Outputting table:");
    core.debug(markdownTableStr);

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
    core.error(error.stack);
    core.setFailed(error.message);
  }
}

run();
