const core = require("@actions/core");
const exec = require("@actions/exec");
const github = require("@actions/github");

const findComment = async (octokit, owner, issue_number, repo) => {

  console.log("finding", owner, issue_number, repo)
  try {
    for await (const { data: comments } of octokit.paginate.iterator(
      octokit.rest.issues.listComments,
      {
        repo,
        owner,
        issue_number,
      }
    )) {
      // Search each page for the comment
      console.log("--------", comments);
      const comment = comments.find(
        (comment) =>
          comment.user.login === "github-actions" &&
          comment.body.startsWith("Bundled size for the files is listed below:")
      );

      if (comment) {
        return comment;
      }
    }
  } catch (e) {
    console.log(e.response.data);
    if (e.response.data.message === "Not Found") {
      return undefined;
    }
    throw e;
  }
};

async function run() {
  function bytesToSize(bytes) {
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (bytes === 0) return "0 Byte";
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
  }
  try {
    // --------------- octokit initialization  ---------------
    const token = core.getInput("token");
    console.log("Initializing oktokit with token", token);
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
    const context = github.context,
      pull_request = context.payload.pull_request;

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
      const existingComment = await findComment(
        octokit,
        github.context.payload.repository.owner.login,
        pull_request.number,
        github.context.payload.repository.name
      );

      console.log("found", existingComment);


      // If the comment exists and starts with our defined header above then it must be our previous comment.
      // Then update instead of creating a new one.
      if (existingComment) {
        octokit.rest.issues.updateComment({
          comment_id: existingComment.id,
          body: result,
        });
      } else {
        // on pull request commit push add comment to pull request
        octokit.rest.issues.createComment(
          Object.assign(Object.assign({}, context.repo), {
            issue_number: pull_request.number,
            body: result,
          })
        );
      }
    }

    // --------------- End Comment repo size  ---------------
  } catch (error) {
    console.log(error.stack);
    core.setFailed(error.message);
  }
}

run();
