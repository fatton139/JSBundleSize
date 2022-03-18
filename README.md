# Comment file size on PR

Simple action to comment file size/s on a PR.

Just specify the path to a directory or file.

You can choose to upsert the existing bot comment or create new ones after every change by configuring the `update_comment` flag.

## Usage:

Please check the below code for detailed usage:

```yaml
steps:
      - uses: actions/checkout@master
      - run: |
        npm install
        npm build
        # ... other build steps
      - uses: fatton139/pr-comment-file-size@master
        with:
          dist_path: "./path-to-output-dir-or-file"
          update_comment: false
          token: ${{ secrets.GITHUB_TOKEN }}

```

## License

The scripts and documentation in this project are released under the [MIT License](./LICENSE)
