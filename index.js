const core = require("@actions/core");
const exec = require("@actions/exec");
const github = require("@actions/github");

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

async function run() {
  try {
    // --------------- octokit initialization  ---------------
    const token = core.getInput("token");
    const updateComment = core.getBooleanInput("update_comment");
    const octokit = new github.getOctokit(token);

    const dist_path = core.getInput("dist_path");

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
    await exec.exec(`du ${dist_path}`, null, outputOptions);
    core.setOutput("size", sizeCalOutput);
    const context = github.context;
    const pullRequest = context.payload.pull_request;
    const owner = context.payload.repository.owner.login;
    const repo = context.payload.repository.name;

    const arrayOutput = sizeCalOutput.split("\n");
    const header = "Bundled size for the files is listed below:";
    let result = `${header} \n \n`;
    arrayOutput.forEach((item) => {
      const i = item.split(/(\s+)/);
      if (item) {
        result += `**${i[2]}**: ${bytesToSize(parseInt(i[0]) * 1000)} \n`;
      }
    });

    if (pull_request) {
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
          body: result,
        });
      } else {
        // on pull request commit push add comment to pull request
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pullRequest.number,
          body: result,
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
